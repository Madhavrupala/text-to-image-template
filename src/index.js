export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Serve HTML UI at root
    if (path === '/' && request.method === 'GET') {
      return new Response(getHTML(), {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    // Analyze image and generate description
    if (path === '/api/analyze-image' && request.method === 'POST') {
      return await analyzeImage(env, request, corsHeaders);
    }

    // Generate new image from prompt
    if (path === '/api/generate-image' && request.method === 'POST') {
      return await generateImage(env, request, corsHeaders);
    }

    // Complete workflow: analyze → generate
    if (path === '/api/transform-image' && request.method === 'POST') {
      return await transformImage(env, request, corsHeaders);
    }

    return new Response(JSON.stringify({
      message: 'AI Image Transformer API',
      endpoints: [
        'GET  / - HTML UI',
        'POST /api/analyze-image - Analyze image to text',
        'POST /api/generate-image - Generate image from text', 
        'POST /api/transform-image - Complete workflow'
      ]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// Analyze image and generate description
async function analyzeImage(env, request, headers) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');
    
    if (!imageFile) {
      return Response.json({ error: 'No image provided' }, { 
        status: 400, headers 
      });
    }

    // Convert image to bytes
    const imageBytes = await imageFile.arrayBuffer();
    const imageUint8 = new Uint8Array(imageBytes);

    // Analyze image content
    const analysis = await env.AI.run('@cf/microsoft/resnet-50', {
      image: imageUint8
    });

    // Generate detailed description using LLM
    const topLabels = analysis.slice(0, 3).map(item => item.label).join(', ');
    
    const descriptionResponse = await env.AI.run('@cf/microsoft/phi-2', {
      messages: [{
        role: "user",
        content: `Describe this image in detail for AI image generation. The image contains: ${topLabels}. Provide a comprehensive description including objects, colors, style, lighting, and composition.`
      }],
      max_tokens: 200
    });

    const description = descriptionResponse.response || `An image featuring ${topLabels}`;

    return Response.json({
      analysis: analysis,
      description: description,
      prompt_suggestion: `Create a new image: ${description}`
    }, { headers });

  } catch (error) {
    return Response.json({
      error: 'Image analysis failed',
      details: error.message
    }, { 
      status: 500, headers 
    });
  }
}

// Generate new image from text prompt
async function generateImage(env, request, headers) {
  try {
    const { prompt, style = "realistic" } = await request.json();
    
    if (!prompt) {
      return Response.json({ error: 'Prompt is required' }, { 
        status: 400, headers 
      });
    }

    // Add style to prompt
    const stylePrompts = {
      realistic: `photorealistic ${prompt}, high detail, 4k`,
      artistic: `artistic painting of ${prompt}, creative, masterpiece`,
      cartoon: `cartoon style ${prompt}, animated, colorful`,
      abstract: `abstract interpretation of ${prompt}, modern art`
    };

    const finalPrompt = stylePrompts[style] || stylePrompts.realistic;

    const response = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: `${finalPrompt} timestamp:${Date.now()}`,
      num_steps: 20
    });

    return new Response(response.image, {
      headers: { ...headers, 'Content-Type': 'image/png' }
    });

  } catch (error) {
    return Response.json({
      error: 'Image generation failed',
      details: error.message
    }, { 
      status: 500, headers 
    });
  }
}

// Complete workflow: analyze → generate
async function transformImage(env, request, headers) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');
    const customPrompt = formData.get('prompt') || '';
    const style = formData.get('style') || 'realistic';

    if (!imageFile) {
      return Response.json({ error: 'No image provided' }, { 
        status: 400, headers 
      });
    }

    // Step 1: Analyze original image
    const imageBytes = await imageFile.arrayBuffer();
    const imageUint8 = new Uint8Array(imageBytes);

    const analysis = await env.AI.run('@cf/microsoft/resnet-50', {
      image: imageUint8
    });

    const topLabels = analysis.slice(0, 3).map(item => item.label).join(', ');
    
    // Step 2: Generate description
    const descriptionResponse = await env.AI.run('@cf/microsoft/phi-2', {
      messages: [{
        role: "user",
        content: `Describe this image for AI generation. Content: ${topLabels}. ${customPrompt ? `Also: ${customPrompt}` : ''}`
      }],
      max_tokens: 150
    });

    const baseDescription = descriptionResponse.response || `An image with ${topLabels}`;
    const finalPrompt = customPrompt ? `${baseDescription}. ${customPrompt}` : baseDescription;

    // Step 3: Generate new image
    const stylePrompts = {
      realistic: `photorealistic ${finalPrompt}, high detail`,
      artistic: `artistic ${finalPrompt}, painting style`,
      cartoon: `cartoon ${finalPrompt}, animated style`,
      abstract: `abstract ${finalPrompt}, modern art`
    };

    const styledPrompt = stylePrompts[style] || stylePrompts.realistic;

    const imageResponse = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: `${styledPrompt} timestamp:${Date.now()}`,
      num_steps: 20
    });

    return new Response(imageResponse.image, {
      headers: { ...headers, 'Content-Type': 'image/png' }
    });

  } catch (error) {
    return Response.json({
      error: 'Image transformation failed',
      details: error.message
    }, { 
      status: 500, headers 
    });
  }
}

// HTML UI
function getHTML() {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>AI Image Transformer</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .header p {
      font-size: 1.2em;
      opacity: 0.9;
    }
    .workflow {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      padding: 30px;
    }
    @media (max-width: 768px) {
      .workflow { grid-template-columns: 1fr; }
    }
    .step {
      background: #f8f9fa;
      border-radius: 15px;
      padding: 25px;
      border: 2px dashed #dee2e6;
    }
    .step.active {
      border-color: #667eea;
      background: #f0f4ff;
    }
    .step h3 {
      color: #495057;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .step-number {
      background: #667eea;
      color: white;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .upload-area {
      border: 2px dashed #667eea;
      border-radius: 10px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      background: #f8f9ff;
    }
    .upload-area:hover {
      background: #eef2ff;
      border-color: #5a67d8;
    }
    .upload-area.dragover {
      background: #e6fffa;
      border-color: #38b2ac;
    }
    .image-preview {
      max-width: 100%;
      max-height: 300px;
      border-radius: 10px;
      display: none;
      margin: 15px auto;
    }
    textarea, select, input {
      width: 100%;
      padding: 12px 15px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      font-size: 16px;
      margin: 10px 0;
      transition: border-color 0.3s ease;
    }
    textarea:focus, select:focus, input:focus {
      outline: none;
      border-color: #667eea;
    }
    textarea {
      height: 100px;
      resize: vertical;
    }
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      margin: 10px 0;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .result-area {
      text-align: center;
      padding: 20px;
    }
    .generated-image {
      max-width: 100%;
      max-height: 400px;
      border-radius: 15px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      display: none;
      margin: 0 auto;
    }
    .loading {
      display: none;
      text-align: center;
      padding: 20px;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 2s linear infinite;
      margin: 0 auto 15px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .analysis-result {
      background: #e8f5e8;
      border: 1px solid #4caf50;
      border-radius: 10px;
      padding: 15px;
      margin: 15px 0;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎨 AI Image Transformer</h1>
      <p>Upload an image → AI describes it → Generate new image!</p>
    </div>

    <div class="workflow">
      <!-- Step 1: Upload & Analyze -->
      <div class="step active" id="step1">
        <h3><span class="step-number">1</span> Upload Image</h3>
        <div class="upload-area" id="uploadArea">
          <div style="font-size: 48px; margin-bottom: 15px;">📁</div>
          <h4>Drag & Drop Image Here</h4>
          <p>or click to select</p>
          <input type="file" id="imageInput" accept="image/*" style="display: none;">
        </div>
        <img id="imagePreview" class="image-preview" alt="Preview">
        
        <div class="analysis-result" id="analysisResult" style="display: none;">
          <h4>📋 Analysis Result:</h4>
          <p id="analysisText"></p>
          <button class="btn" onclick="useAnalysis()">Use This Description</button>
        </div>

        <button class="btn" id="analyzeBtn" disabled onclick="analyzeImage()">
          🔍 Analyze Image
        </button>
      </div>

      <!-- Step 2: Generate New Image -->
      <div class="step" id="step2">
        <h3><span class="step-number">2</span> Generate New Image</h3>
        
        <label>Image Description:</label>
        <textarea id="promptInput" placeholder="AI will generate description from your image..."></textarea>
        
        <label>Additional Instructions (Optional):</label>
        <input type="text" id="customPrompt" placeholder="e.g., make it sunset, add mountains...">
        
        <label>Style:</label>
        <select id="styleSelect">
          <option value="realistic">Realistic</option>
          <option value="artistic">Artistic</option>
          <option value="cartoon">Cartoon</option>
          <option value="abstract">Abstract</option>
        </select>

        <button class="btn" id="generateBtn" onclick="generateNewImage()">
          🎨 Generate New Image
        </button>
      </div>
    </div>

    <!-- Results -->
    <div class="result-area">
      <div class="loading" id="loading">
        <div class="spinner"></div>
        <p id="loadingText">Processing your image...</p>
      </div>
      
      <img id="generatedImage" class="generated-image" alt="Generated Image">
      <div id="resultActions" style="display: none; margin-top: 20px;">
        <button class="btn" onclick="downloadImage()">💾 Download Image</button>
        <button class="btn" onclick="resetWorkflow()">🔄 Start Over</button>
      </div>
    </div>
  </div>

  <script>
    let currentImageFile = null;
    let generatedImageUrl = null;

    // Drag & drop functionality
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    const imagePreview = document.getElementById('imagePreview');
    const analyzeBtn = document.getElementById('analyzeBtn');

    uploadArea.addEventListener('click', () => imageInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleImageSelect(files[0]);
      }
    });

    imageInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleImageSelect(e.target.files[0]);
      }
    });

    function handleImageSelect(file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      currentImageFile = file;
      
      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
        analyzeBtn.disabled = false;
        
        // Hide previous analysis
        document.getElementById('analysisResult').style.display = 'none';
      };
      reader.readAsDataURL(file);
    }

    async function analyzeImage() {
      if (!currentImageFile) return;

      showLoading('Analyzing image...');
      
      const formData = new FormData();
      formData.append('image', currentImageFile);

      try {
        const response = await fetch('/api/analyze-image', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (response.ok) {
          document.getElementById('analysisText').textContent = result.description;
          document.getElementById('analysisResult').style.display = 'block';
          document.getElementById('promptInput').value = result.prompt_suggestion;
        } else {
          alert('Analysis failed: ' + result.error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        hideLoading();
      }
    }

    function useAnalysis() {
      document.getElementById('step2').classList.add('active');
      document.getElementById('step2').scrollIntoView({ behavior: 'smooth' });
    }

    async function generateNewImage() {
      const prompt = document.getElementById('promptInput').value;
      const customPrompt = document.getElementById('customPrompt').value;
      const style = document.getElementById('styleSelect').value;

      if (!prompt.trim()) {
        alert('Please enter an image description');
        return;
      }

      showLoading('Generating new image...');

      try {
        let response;
        
        if (currentImageFile && customPrompt) {
          // Use transform endpoint for image + custom prompt
          const formData = new FormData();
          formData.append('image', currentImageFile);
          formData.append('prompt', customPrompt);
          formData.append('style', style);

          response = await fetch('/api/transform-image', {
            method: 'POST',
            body: formData
          });
        } else {
          // Use simple generate endpoint
          response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              prompt: customPrompt ? `${prompt}. ${customPrompt}` : prompt,
              style: style
            })
          });
        }

        if (response.ok) {
          const blob = await response.blob();
          generatedImageUrl = URL.createObjectURL(blob);
          
          const generatedImage = document.getElementById('generatedImage');
          generatedImage.src = generatedImageUrl;
          generatedImage.style.display = 'block';
          
          document.getElementById('resultActions').style.display = 'block';
          generatedImage.scrollIntoView({ behavior: 'smooth' });
        } else {
          const error = await response.text();
          alert('Generation failed: ' + error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        hideLoading();
      }
    }

    function downloadImage() {
      if (generatedImageUrl) {
        const link = document.createElement('a');
        link.href = generatedImageUrl;
        link.download = 'ai-generated-image.png';
        link.click();
      }
    }

    function resetWorkflow() {
      currentImageFile = null;
      generatedImageUrl = null;
      
      // Reset UI
      imagePreview.style.display = 'none';
      imageInput.value = '';
      document.getElementById('analysisResult').style.display = 'none';
      document.getElementById('promptInput').value = '';
      document.getElementById('customPrompt').value = '';
      document.getElementById('generatedImage').style.display = 'none';
      document.getElementById('resultActions').style.display = 'none';
      analyzeBtn.disabled = true;
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showLoading(text) {
      document.getElementById('loadingText').textContent = text;
      document.getElementById('loading').style.display = 'block';
    }

    function hideLoading() {
      document.getElementById('loading').style.display = 'none';
    }
  </script>
</body>
</html>
  `;
}
