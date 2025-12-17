/* globals puter */

/**
 * Droid Factory to Puter.js Bridge
 * 
 * This script bridges requests from Droid Factory to Puter.js
 * allowing you to use Puter.js functionality through Droid Factory
 */

class PuterJsBridge {
  constructor() {
    this.puterReady = false;
    this.initPuter();
  }

  async initPuter() {
    // Check if Puter.js is already loaded (from HTML script tag)
    if (typeof puter !== 'undefined') {
      console.log('✅ Puter.js loaded, checking available methods...');
      console.log('puter object:', puter);
      console.log('puter.init type:', typeof puter.init);
      
      // Check what methods are available
      if (puter && typeof puter === 'object') {
        console.log('Available puter methods:', Object.keys(puter));
        if (puter.ai) {
          console.log('Available AI methods:', Object.keys(puter.ai));
        }
        if (puter.fs) {
          console.log('Available FS methods:', Object.keys(puter.fs));
        }
      }
      
      // Try to initialize if init method exists
      if (typeof puter.init === 'function') {
        try {
          await puter.init();
          this.puterReady = true;
          console.log('✅ Puter.js ready for Droid Factory integration');
          this.showStatus('Puter.js initialized successfully!');
        } catch (error) {
          console.error('❌ Failed to initialize Puter.js:', error);
          this.showStatus('❌ Failed to initialize Puter.js: ' + error.message);
        }
      } else {
        console.warn('⚠️ puter.init is not available, checking if Puter.js is already initialized...');
        // Maybe Puter.js auto-initializes? Check if we can use it directly
        try {
          // Test if we can access AI functionality directly
          if (puter && puter.ai && typeof puter.ai.chat === 'function') {
            this.puterReady = true;
            console.log('✅ Puter.js appears to be ready (auto-initialized?)');
            this.showStatus('✅ Puter.js is ready! All features available.');
          } else {
            throw new Error('Puter.js is loaded but AI methods are not available');
          }
        } catch (error) {
          console.error('❌ Puter.js not ready:', error);
          this.showStatus('❌ Puter.js not ready: ' + error.message);
        }
      }
      return;
    }

    // If not loaded, load it dynamically
    console.log('🔄 Loading Puter.js dynamically...');
    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/';
    script.onload = async () => {
      console.log('✅ Puter.js script loaded dynamically');
      // Wait a bit for initialization
      setTimeout(async () => {
        if (typeof puter !== 'undefined') {
          console.log('puter object after dynamic load:', puter);
          console.log('puter.init type:', typeof puter.init);
          
          if (typeof puter.init === 'function') {
            try {
              await puter.init();
              this.puterReady = true;
              console.log('✅ Puter.js ready for Droid Factory integration');
              this.showStatus('Puter.js initialized successfully!');
            } catch (error) {
              console.error('❌ Failed to initialize Puter.js:', error);
              this.showStatus('❌ Failed to initialize Puter.js: ' + error.message);
            }
          } else {
            console.warn('⚠️ puter.init is not available after dynamic load');
            this.showStatus('⚠️ puter.init not available');
          }
        } else {
          console.error('❌ Puter.js still not available after dynamic load');
          this.showStatus('❌ Failed to load Puter.js');
        }
      }, 1000);
    };
    script.onerror = () => {
      console.error('❌ Failed to load Puter.js script');
      this.showStatus('❌ Failed to load Puter.js script');
    };
    document.head.appendChild(script);
  }

  showStatus(message) {
    // Only show status if document is ready
    if (typeof document === 'undefined') {
      console.log('Status:', message);
      return;
    }
    
    try {
      // Create a status element if it doesn't exist
      let statusEl = document.getElementById('puter-status');
      if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'puter-status';
        statusEl.style.position = 'fixed';
        statusEl.style.top = '10px';
        statusEl.style.right = '10px';
        statusEl.style.background = '#007bff';
        statusEl.style.color = 'white';
        statusEl.style.padding = '10px';
        statusEl.style.borderRadius = '5px';
        statusEl.style.zIndex = '9999';
        statusEl.style.fontFamily = 'Arial, sans-serif';
        statusEl.style.fontSize = '14px';
        
        // Make sure document.body exists
        if (document.body) {
          document.body.appendChild(statusEl);
        } else {
          // Document not ready yet, try again later
          setTimeout(() => this.showStatus(message), 100);
          return;
        }
      }
      statusEl.textContent = message;
    } catch (error) {
      console.log('Status update failed:', message, error);
    }
  }

  async handleDroidFactoryRequest(request) {
    console.log('🔄 Handling Droid Factory request via API endpoint:', request);

    try {
      const response = await fetch('/api/droid-factory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error handling request via API endpoint:', error);
      return {
        success: false,
        error: error.message,
        tool: request.tool
      };
    }
  }

  // Example usage methods
  async exampleChat() {
    const request = {
      tool: 'ai.chat',
      parameters: {
        message: 'Explain AI like I\'m five!'
      }
    };
    return await this.handleDroidFactoryRequest(request);
  }

  async exampleImageGeneration() {
    const request = {
      tool: 'image.generate',
      parameters: {
        prompt: 'A cute robot playing chess with a cat'
      }
    };
    return await this.handleDroidFactoryRequest(request);
  }
}

// Export for use in your application
if (typeof window !== 'undefined') {
  window.puterBridge = new PuterJsBridge();
  
  // Quick test to verify the bridge is working
  setTimeout(() => {
    if (window.puterBridge.puterReady) {
      console.log('🔧 Testing bridge functionality...');
      try {
        // Test that we can access puter methods through the bridge
        if (puter && puter.ai && typeof puter.ai.chat === 'function') {
          console.log('✅ Bridge test: puter.ai.chat is available');
        }
        if (puter && puter.fs && typeof puter.fs.write === 'function') {
          console.log('✅ Bridge test: puter.fs.write is available');
        }
        console.log('✅ Bridge is ready and functional!');
      } catch (error) {
        console.error('❌ Bridge test failed:', error);
      }
    }
  }, 2000);
}

// Example of how to use in your application:
/*
// In your main application code
async function handleDroidFactoryRequest(request) {
  try {
    const result = await window.puterBridge.handleDroidFactoryRequest(request);
    console.log('✅ Droid Factory request completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Droid Factory request failed:', error);
    return { error: error.message };
  }
}

// Example usage:
handleDroidFactoryRequest({
  tool: 'ai.chat',
  parameters: { message: 'Hello Puter.js!' }
}).then(result => {
  console.log('AI Response:', result.result);
});
*/

console.log('🔌 Puter.js Bridge for Droid Factory loaded');
console.log('Use window.puterBridge to access the bridge');