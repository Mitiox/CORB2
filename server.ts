import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware to handle larger payloads (images)
  app.use(express.json({ limit: '50mb' }));

  // Endpoint to fetch external images and return as base64 to avoid canvas tainting/CORS
  app.post('/api/proxy-image', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'Missing url' });
      }

      let validUrl: URL;
      try {
        validUrl = new URL(url);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      const response = await fetch(validUrl.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      
      const base64 = buffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64}`;

      res.json({ dataUri });
    } catch (error: any) {
      console.error('Error proxying image:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch image' });
    }
  });

  // Endpoint to remove background using remove.bg API
  app.post('/api/remove-bg', async (req, res) => {
    try {
      const { base64Data } = req.body;
      if (!base64Data) {
        return res.status(400).json({ error: 'Missing base64Data' });
      }

      const apiKeys = [
        process.env.REMOVE_BG_API_KEY,
        process.env.REMOVE_BG_API_KEY_2,
        process.env.REMOVE_BG_API_KEY_3
      ].filter(Boolean) as string[];

      if (apiKeys.length === 0) {
        throw new Error('REMOVE_BG_API_KEY is not configured in environment secrets. Please get a free API key from remove.bg and add it.');
      }

      let response;
      for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[i];
        response = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: {
            'X-Api-Key': currentKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            image_file_b64: base64Data,
            size: 'auto',
            format: 'png'
          })
        });

        if (response.ok) {
          break;
        }

        // Always consume the response body even if we ignore it, to free up memory/sockets
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (e) {
          // Ignore json parse errors for intermediate failed attempts
        }

        if (response.status !== 402 && response.status !== 403) {
          // If it's a 400 Bad Request or 500 error, don't cycle keys
          let errorMessage = `Remove.bg API failed (${response.status})`;
          if (errorData && errorData.errors && errorData.errors.length > 0) {
            errorMessage = errorData.errors[0].title || errorData.errors[0].detail || errorMessage;
          }
          throw new Error(errorMessage);
        }

        if (i === apiKeys.length - 1) {
          // All keys exhausted
          let errorMessage = `All configured Remove.bg API keys are out of credits or invalid (${response.status}).`;
          if (errorData && errorData.errors && errorData.errors.length > 0) {
            errorMessage = errorData.errors[0].title || errorData.errors[0].detail || errorMessage;
          }
          throw new Error(errorMessage);
        }
      }

      if (!response || !response.ok) {
        throw new Error('Failed to remove background due to an unknown API error.');
      }

      const data = await response.json();
      if (!data || !data.data || !data.data.result_b64) {
        throw new Error('Invalid response from remove.bg API');
      }

      const dataUri = `data:image/png;base64,${data.data.result_b64}`;
      res.json({ dataUri });
    } catch (error: any) {
      console.error('Error removing background:', error);
      res.status(500).json({ error: error.message || 'Failed to remove background' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
