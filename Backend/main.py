from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
import base64
from io import BytesIO
from PIL import Image
import pytesseract
from transformers import BlipProcessor, BlipForConditionalGeneration
import torch
import google.generativeai as genai
import logging
import numpy as np

app = FastAPI()

# Allow CORS for all origins (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load BLIP model and processor once
processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)

# Configure Gemini API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY environment variable not set.")
genai.configure(api_key=GEMINI_API_KEY)

logging.basicConfig(level=logging.INFO)

@app.get("/health")
def health_check():
    return {"status": "ok"}

class AskRequest(BaseModel):
    question: str
    image: str  # base64 data URL

@app.post("/ask")
def ask(request: AskRequest):
    prompt = f"User asked: {request.question}. If an image is provided, it is a handwritten math problem. Please extract the math problem from the image and solve it."
    ocr_text = ""
    image_caption = ""
    image = None
    is_blank_image = False
    if request.image:
        logging.info(f"Received base64 image string of length: {len(request.image)}")
        # Remove header if present
        image_data = request.image.split(",")[-1]
        if image_data.strip() == "":
            logging.info("Received image data is empty after stripping header.")
        else:
            try:
                image_bytes = base64.b64decode(image_data)
                image = Image.open(BytesIO(image_bytes)).convert("RGB")
                # Improved blank image detection: count non-white pixels
                np_img = None
                try:
                    np_img = np.array(image)
                    non_white = np.sum(np.any(np_img != [255, 255, 255], axis=-1))
                    total = np_img.shape[0] * np_img.shape[1]
                    logging.info(f"Non-white pixels: {non_white} / {total}")
                    # If less than 0.5% of pixels are non-white, treat as blank
                    if non_white / total < 0.005:
                        is_blank_image = True
                        logging.info("Image appears to be blank (almost all white).")
                    else:
                        logging.info("Image has drawing, proceeding with OCR and captioning.")
                except Exception as e:
                    logging.warning(f"Numpy not available or error in blank detection: {e}")
                # OCR
                ocr_text = pytesseract.image_to_string(image)
                logging.info(f"OCR extracted text: {ocr_text}")
                # Image captioning
                inputs = processor(image, return_tensors="pt").to(device)
                out = model.generate(**inputs)
                image_caption = processor.decode(out[0], skip_special_tokens=True)
                logging.info(f"Image caption: {image_caption}")
            except Exception as e:
                ocr_text = f"Error processing image: {str(e)}"
                logging.error(f"Error processing image: {str(e)}")
    else:
        logging.info("No image data received in request.")
    if ocr_text:
        prompt += f" OCR extracted text: {ocr_text.strip()}"
    if image_caption:
        prompt += f" Image caption: {image_caption.strip()}"
    try:
        gemini_model = genai.GenerativeModel("gemini-1.5-flash")
        if image:
            logging.info("Sending prompt and image to Gemini for multimodal analysis.")
            response = gemini_model.generate_content([
                prompt,
                image
            ])
        else:
            logging.info("Sending prompt only to Gemini (no image provided or could not decode image).")
            response = gemini_model.generate_content(prompt)
        answer = response.text.strip()
        logging.info(f"Gemini answer: {answer}")
        return {"answer": answer}
    except Exception as e:
        logging.error(f"Error from Gemini: {str(e)}")
        return {"answer": f"Error: {str(e)}"} 