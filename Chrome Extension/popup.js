// Popup script for Context AI Snippet
class ContextAIPopup {
  constructor() {
    this.apiKeyInput = document.getElementById('apiKey');
    this.saveButton = document.getElementById('saveButton');
    this.status = document.getElementById('status');
    this.extensionToggle = document.getElementById('extensionToggle');
    this.queriesCount = document.getElementById('queriesCount');
    this.tokensUsed = document.getElementById('tokensUsed');

    this.init();
  }

  async init() {
    // Load saved settings
    await this.loadSettings();
    await this.loadStats();
    
    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.saveButton.addEventListener('click', () => this.saveApiKey());
    this.extensionToggle.addEventListener('change', () => this.toggleExtension());
    
    // Save on Enter key
    this.apiKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveApiKey();
      }
    });
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['openaiApiKey', 'extensionEnabled']);
      
      if (result.openaiApiKey) {
        this.apiKeyInput.value = result.openaiApiKey;
      }
      
      this.extensionToggle.checked = result.extensionEnabled ?? true;
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async loadStats() {
    try {
      const today = new Date().toDateString();
      const result = await chrome.storage.local.get([
        'dailyQueries',
        'dailyTokens',
        'lastStatsDate'
      ]);
      
      // Reset daily stats if it's a new day
      if (result.lastStatsDate !== today) {
        await chrome.storage.local.set({
          dailyQueries: 0,
          dailyTokens: 0,
          lastStatsDate: today
        });
        this.queriesCount.textContent = '0';
        this.tokensUsed.textContent = '0';
      } else {
        this.queriesCount.textContent = result.dailyQueries || 0;
        this.tokensUsed.textContent = result.dailyTokens || 0;
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async saveApiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    
    if (!apiKey) {
      this.showStatus('Please enter an API key', 'error');
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      this.showStatus('API key should start with "sk-"', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ openaiApiKey: apiKey });
      this.showStatus('API key saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving API key:', error);
      this.showStatus('Error saving API key', 'error');
    }
  }

  async toggleExtension() {
    const enabled = this.extensionToggle.checked;
    
    try {
      await chrome.storage.sync.set({ extensionEnabled: enabled });
      
      // Notify all content scripts about the change
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'toggleStateChanged',
            enabled: enabled
          });
        } catch (e) {
          // Content script might not be loaded, ignore error
        }
      }
    } catch (error) {
      console.error('Error toggling extension:', error);
    }
  }

  showStatus(message, type) {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    this.status.style.display = 'block';
    
    setTimeout(() => {
      this.status.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ContextAIPopup();
});