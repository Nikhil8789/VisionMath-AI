import './style.css'

const app = document.getElementById('app')
app.innerHTML = `
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-blue-100 font-sans">
    <div class="bg-white shadow-2xl rounded-3xl p-10 w-full max-w-2xl flex flex-col items-center border border-blue-100">
      <h1 class="text-4xl font-extrabold mb-2 text-blue-800 tracking-tight">NikNumerix</h1>
      <p class="text-gray-500 mb-8 text-center text-lg">Draw a math problem, upload a picture, or enter a question below. The AI will read and solve it for you!</p>
      <canvas id="draw-canvas" width="600" height="400" class="border border-gray-300 rounded-xl bg-white mb-6 shadow-md"></canvas>
      <input id="image-upload" type="file" accept="image/*" class="mb-4 w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
      <div class="flex w-full gap-2 mb-4">
        <input id="question-input" type="text" placeholder="Ask a question..." class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-lg shadow-sm" />
        <button id="submit-btn" class="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-7 py-2 rounded-lg shadow transition">Submit</button>
      </div>
      <button id="clear-btn" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg mb-4 transition border border-gray-200">Clear Canvas</button>
      <div class="w-full mt-2">
        <div id="response" class="min-h-[3rem] bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-lg text-gray-900 shadow-inner transition-all text-left whitespace-pre-line font-sans"></div>
      </div>
    </div>
  </div>
`

// Drawing logic
const canvas = document.getElementById('draw-canvas')
const ctx = canvas.getContext('2d')
let drawing = false
let uploadedImageData = null

// Set canvas background to white
ctx.fillStyle = '#fff'
ctx.fillRect(0, 0, canvas.width, canvas.height)

// Set drawing color to black
ctx.strokeStyle = '#000'
ctx.lineWidth = 4

canvas.addEventListener('mousedown', (e) => {
  drawing = true
  ctx.beginPath()
  ctx.moveTo(e.offsetX, e.offsetY)
})
canvas.addEventListener('mousemove', (e) => {
  if (!drawing) return
  ctx.lineTo(e.offsetX, e.offsetY)
  ctx.stroke()
})
canvas.addEventListener('mouseup', () => {
  drawing = false
})
canvas.addEventListener('mouseleave', () => {
  drawing = false
})

// Image upload logic
const imageUpload = document.getElementById('image-upload')
imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = function(event) {
    const img = new window.Image()
    img.onload = function() {
      // Clear canvas and draw uploaded image
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // Fit image to canvas
      let scale = Math.min(canvas.width / img.width, canvas.height / img.height)
      let x = (canvas.width / 2) - (img.width / 2) * scale
      let y = (canvas.height / 2) - (img.height / 2) * scale
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale)
      uploadedImageData = canvas.toDataURL('image/png')
    }
    img.src = event.target.result
  }
  reader.readAsDataURL(file)
})

// Clear button logic
const clearBtn = document.getElementById('clear-btn')
clearBtn.addEventListener('click', () => {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  uploadedImageData = null
  imageUpload.value = ''
})

// Format answer for better alignment
function formatAnswer(answer) {
  // Convert markdown-like lists to real lists
  let formatted = answer
    .replace(/\n\s*\*/g, '\n•') // bullet points
    .replace(/\n\s*\d+\./g, match => '\n' + match.trim()) // numbered lists
    .replace(/\n{2,}/g, '\n\n') // extra spacing for paragraphs
  return formatted
}

// Submit logic
const submitBtn = document.getElementById('submit-btn')
submitBtn.addEventListener('click', async () => {
  const question = document.getElementById('question-input').value
  // Use uploaded image if present, otherwise use canvas drawing
  const imageData = uploadedImageData || canvas.toDataURL('image/png')
  const responseDiv = document.getElementById('response')
  responseDiv.textContent = 'Submitting...'
  responseDiv.classList.remove('bg-green-50', 'border-green-200', 'text-green-900')
  try {
    const res = await fetch('http://127.0.0.1:8000/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, image: imageData })
    })
    if (!res.ok) throw new Error('Failed to get response')
    const data = await res.json()
    responseDiv.textContent = ''
    responseDiv.innerText = formatAnswer(data.answer || 'No answer received.')
    responseDiv.classList.add('bg-green-50', 'border-green-200', 'text-green-900')
  } catch (err) {
    responseDiv.textContent = 'Error: ' + err.message
    responseDiv.classList.remove('bg-green-50', 'border-green-200', 'text-green-900')
  }
})
