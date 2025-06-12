// Background script for Context AI Snippet
class ContextAIBackground {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getGPTExplanation') {
        this.handleGPTRequest(request.data, sendResponse);
        return true; // Keep the message channel open for async response
      }
      
      if (request.action === 'getToggleState') {
        this.getToggleState(sendResponse);
        return true;
      }
      
      if (request.action === 'setToggleState') {
        this.setToggleState(request.enabled, sendResponse);
        return true;
      }
    });
  }

  async handleGPTRequest(data, sendResponse) {
    try {
      const { highlightedText, context, pageTitle, pageUrl } = data;
      
      // Get API key from storage
      const result = await chrome.storage.sync.get(['openaiApiKey']);
      if (!result.openaiApiKey) {
        sendResponse({ 
          error: 'OpenAI API key not configured. Please set it in the extension popup.' 
        });
        return;
      }

      // Construct the prompt as specified in PRD
      const prompt = `Explain the following text in plain English using the surrounding context: "${highlightedText}"

Context: ${context}

Page Title: ${pageTitle}
Page Topic: ${this.extractTopicFromUrl(pageUrl)}

Provide a concise explanation in 100-300 tokens.`;

      // Make API call to OpenAI
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${result.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const responseData = await response.json();
      const explanation = responseData.choices[0].message.content.trim();

      sendResponse({ 
        success: true, 
        explanation: explanation,
        tokensUsed: responseData.usage?.total_tokens || 0
      });

    } catch (error) {
      console.error('GPT request failed:', error);
      sendResponse({ 
        error: `Failed to get explanation: ${error.message}` 
      });
    }
  }

  async getToggleState(sendResponse) {
    try {
      const result = await chrome.storage.sync.get(['extensionEnabled']);
      sendResponse({ enabled: result.extensionEnabled ?? true });
    } catch (error) {
      sendResponse({ enabled: true });
    }
  }

  async setToggleState(enabled, sendResponse) {
    try {
      await chrome.storage.sync.set({ extensionEnabled: enabled });
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  extractTopicFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
      
      if (pathSegments.length > 0) {
        return `${domain} - ${pathSegments[0]}`;
      }
      return domain;
    } catch {
      return 'webpage';
    }
  }
}

// Initialize the background script
new ContextAIBackground();