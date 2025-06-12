// Content script for Context AI Snippet
class ContextAIContent {
  constructor() {
    this.isEnabled = true;
    this.currentPopup = null;
    this.nib = null;
    this.isProcessing = false;
    this.nibSide = 'right'; // 'left' or 'right'
    this.isDragging = false; // Track dragging state
    this.initialDragOffset = { x: 0, y: 0 };
    
    this.init();
  }

  async init() {
    // Check if extension is enabled and load nib position
    await this.loadSettings();
    
    // Create the nib UI
    this.createNib();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Listen for toggle state changes from popup
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'toggleStateChanged') {
        this.isEnabled = message.enabled;
        this.updateNibToggle();
        this.saveToggleState(this.isEnabled); // Sync back
      }
    });
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getToggleState' },
        (response) => {
          this.isEnabled = response?.enabled ?? true;
          resolve();
        }
      );
    });
    
    // Load nib position
    chrome.storage.sync.get(['nibSide', 'nibPosition'], (result) => {
      this.nibSide = result.nibSide || 'right';
      this.nibPosition = result.nibPosition || { top: '50%' };
    });
  }

  createNib() {
    // Create the slim vertical tab nib - removed the AI icon
    this.nib = document.createElement('div');
    this.nib.className = `context-ai-nib ${this.nibSide === 'left' ? 'left-side' : ''}`;
    this.nib.innerHTML = `
      <div class="nib-expanded">
        <div class="nib-title">Context AI</div>
        <label class="toggle-switch">
          <input type="checkbox" ${this.isEnabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    `;
    
    // Set initial position
    if (this.nibPosition) {
      this.nib.style.top = this.nibPosition.top;
    }
    
    document.body.appendChild(this.nib);
    
    // Make nib draggable with edge snapping
    this.makeDraggable(this.nib);
    
    // Set up nib toggle functionality with state sync
    const toggle = this.nib.querySelector('input[type="checkbox"]');
    toggle.addEventListener('change', (e) => {
      this.isEnabled = e.target.checked;
      this.saveToggleState(this.isEnabled);
    });
  }

  updateNibToggle() {
    const toggle = this.nib.querySelector('input[type="checkbox"]');
    if (toggle) {
      toggle.checked = this.isEnabled;
    }
  }

  saveToggleState(enabled) {
    chrome.runtime.sendMessage({
      action: 'setToggleState',
      enabled: enabled
    });
  }

  makeDraggable(element) {
    element.addEventListener('mousedown', (e) => {
      if (e.target.closest('.toggle-switch')) return;
      
      // Prevent text selection during drag
      e.preventDefault();
      
      this.isDragging = true;
      
      // Calculate initial Y offset only (since we're keeping X fixed to edges)
      const rect = element.getBoundingClientRect();
      this.initialDragOffset = {
        x: 0, // Not used since we snap to edges
        y: e.clientY - rect.top
      };
      
      // Add dragging class to prevent text selection
      document.body.classList.add('context-ai-dragging');
      element.classList.add('dragging');
      
      // Bind event handlers
      this.boundHandleDrag = this.handleDrag.bind(this);
      this.boundHandleStopDrag = this.handleStopDrag.bind(this);
      this.boundPreventSelection = this.preventSelection.bind(this);
      
      // Use document for event listeners to maintain control even when mouse leaves nib
      document.addEventListener('mousemove', this.boundHandleDrag);
      document.addEventListener('mouseup', this.boundHandleStopDrag);
      document.addEventListener('selectstart', this.boundPreventSelection);
      
      // Prevent text selection
      document.body.style.userSelect = 'none';
    });
  }

  preventSelection(e) {
    e.preventDefault();
    return false;
  }

  handleDrag = (event) => {
    if (!this.isDragging) return;

    // Only use mouse Y position for vertical movement
    const newTop = event.clientY - this.initialDragOffset.y;
    
    // Constrain vertically within viewport
    const constrainedTop = Math.max(0, Math.min(window.innerHeight - this.nib.offsetHeight, newTop));

    // Determine which side based on mouse X position relative to screen center
    const centerX = window.innerWidth / 2;
    const isLeftSide = event.clientX < centerX;
    
    // Update position - keep nib attached to the edge
    this.nib.style.position = 'fixed';
    this.nib.style.top = `${constrainedTop}px`;
    
    if (isLeftSide) {
      this.nibSide = 'left';
      this.nib.style.left = '0px';
      this.nib.style.right = 'auto';
      this.nib.className = `context-ai-nib left-side dragging`;
    } else {
      this.nibSide = 'right';
      this.nib.style.right = '0px';
      this.nib.style.left = 'auto';
      this.nib.className = `context-ai-nib dragging`;
    }
  };

  handleStopDrag = () => {
    this.isDragging = false;
    this.nib.classList.remove('dragging');
    document.body.classList.remove('context-ai-dragging');
    
    // Clean up event listeners
    document.removeEventListener('mousemove', this.boundHandleDrag);
    document.removeEventListener('mouseup', this.boundHandleStopDrag);
    document.removeEventListener('selectstart', this.boundPreventSelection);
    
    // Restore text selection
    document.body.style.userSelect = '';
    
    // Update class to reflect final side (dragging class already removed)
    if (this.nibSide === 'left') {
      this.nib.className = 'context-ai-nib left-side';
    } else {
      this.nib.className = 'context-ai-nib';
    }
    
    // Save the new position
    this.saveNibPosition();
  };

  snapToLeft() {
    this.nibSide = 'left';
    this.nib.className = `context-ai-nib left-side ${this.isDragging ? 'dragging' : ''}`;
    this.nib.style.left = '0px';
    this.nib.style.right = 'auto';
  }

  snapToRight() {
    this.nibSide = 'right';
    this.nib.className = `context-ai-nib ${this.isDragging ? 'dragging' : ''}`;
    this.nib.style.right = '0px';
    this.nib.style.left = 'auto';
  }

  saveNibPosition() {
    const position = {
      top: this.nib.style.top
    };
    
    chrome.storage.sync.set({
      nibSide: this.nibSide,
      nibPosition: position
    });
  }

  // Check if current page is a PDF
  isPDFPage() {
    // Check for PDF.js viewer elements
    return !!(
      document.querySelector('#viewerContainer') ||
      document.querySelector('.textLayer') ||
      document.querySelector('#viewer') ||
      document.querySelector('[data-page-number]') ||
      document.querySelector('.page') ||
      // Check if URL suggests PDF
      window.location.href.includes('.pdf') ||
      // Check for PDF.js specific elements
      document.querySelector('div[id^="pageContainer"]')
    );
  }

  setupEventListeners() {
    // Listen for text selection with filtering
    document.addEventListener('mouseup', (e) => {
      // Don't trigger if we're dragging the nib
      if (!this.isEnabled || this.isProcessing || this.isDragging) return;
      
      setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText.length > 0 && this.isValidSelection(selection)) {
          this.handleTextSelection(selectedText, selection);
        }
      }, 100);
    });

    // Remove popup when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (this.currentPopup && !this.currentPopup.contains(e.target)) {
        this.removePopup();
      }
    });
  }

  isValidSelection(selection) {
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Get the actual element (not text node)
    const element = container.nodeType === Node.TEXT_NODE ? 
      container.parentElement : container;
    
    // Enhanced blocking for editable elements
    if (element.isContentEditable) return false;
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return false;
    if (element.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return false;
    
    // Block other form elements that might be editable
    if (element.closest('form') && (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT'
    )) return false;
    
    // Allow selection in PDFs
    if (this.isPDFPage()) {
      // For PDFs, we want to allow text selection from text layers
      const isInTextLayer = element.closest('.textLayer, .page, [data-page-number], #viewerContainer');
      return !!isInTextLayer;
    }
    
    return true;
  }

  async handleTextSelection(selectedText, selection) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.removePopup();

    try {
      // Get the range and position for popup
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Extract context around the selection
      const context = this.extractContext(range);
      
      // Create loading popup
      this.createPopup(rect, 'Loading explanation...');
      
      // Send request to background script
      const response = await this.sendGPTRequest({
        highlightedText: selectedText,
        context: context,
        pageTitle: document.title,
        pageUrl: window.location.href
      });

      if (response.error) {
        this.updatePopup(`Error: ${response.error}`);
      } else {
        this.updatePopup(response.explanation);
      }
      
    } catch (error) {
      console.error('Error handling text selection:', error);
      this.updatePopup('Error: Failed to get explanation');
    } finally {
      this.isProcessing = false;
    }
  }

  extractContext(range) {
    const container = range.commonAncestorContainer;
    
    // Enhanced context extraction for PDFs
    if (this.isPDFPage()) {
      return this.extractPDFContext(range);
    }
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    // Find the selected text node
    const selectedNode = range.startContainer;
    const selectedIndex = textNodes.indexOf(selectedNode);
    
    if (selectedIndex === -1) return '';

    // Get surrounding text (200-500 words as specified in PRD)
    const contextNodes = [];
    const contextRange = 10; // Number of nodes before and after
    
    for (let i = Math.max(0, selectedIndex - contextRange); 
         i < Math.min(textNodes.length, selectedIndex + contextRange + 1); 
         i++) {
      contextNodes.push(textNodes[i].textContent);
    }

    const fullContext = contextNodes.join(' ').replace(/\s+/g, ' ').trim();
    
    // Limit to approximately 200-500 words
    const words = fullContext.split(' ');
    if (words.length > 500) {
      return words.slice(0, 500).join(' ') + '...';
    }
    
    return fullContext;
  }

  extractPDFContext(range) {
    try {
      // For PDFs, try to get context from the current page or surrounding text
      const selectedElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ?
        range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
      
      // Find the page container
      const pageContainer = selectedElement.closest('.page, [data-page-number], .textLayer');
      
      if (pageContainer) {
        // Get all text from the current page
        const pageText = pageContainer.textContent || pageContainer.innerText || '';
        const words = pageText.replace(/\s+/g, ' ').trim().split(' ');
        
        // Limit context size
        if (words.length > 500) {
          // Try to find the selected text position and get surrounding context
          const selectedText = range.toString();
          const textIndex = pageText.indexOf(selectedText);
          if (textIndex !== -1) {
            const start = Math.max(0, textIndex - 1000);
            const end = Math.min(pageText.length, textIndex + selectedText.length + 1000);
            return pageText.substring(start, end);
          }
          return words.slice(0, 500).join(' ') + '...';
        }
        
        return pageText;
      }
      
      // Fallback: get text from nearby elements
      return selectedElement.textContent || '';
    } catch (error) {
      console.error('Error extracting PDF context:', error);
      return '';
    }
  }

  sendGPTRequest(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getGPTExplanation', data: data },
        (response) => {
          resolve(response || { error: 'No response from background script' });
        }
      );
    });
  }

  createPopup(rect, content) {
    this.currentPopup = document.createElement('div');
    this.currentPopup.className = 'context-ai-popup';
    this.currentPopup.innerHTML = `
      <div class="popup-content">
        <button class="popup-close">&times;</button>
        <div class="popup-body">${content}</div>
      </div>
    `;

    // Position popup adjacent to selected text
    const popupWidth = 300;
    const popupHeight = 300;
    
    let left = rect.right + 10;
    let top = rect.top;
    
    // Adjust if popup would go off screen
    if (left + popupWidth > window.innerWidth) {
      left = rect.left - popupWidth - 10;
    }
    
    if (top + popupHeight > window.innerHeight) {
      top = window.innerHeight - popupHeight - 10;
    }
    
    // Ensure popup doesn't go off top of screen
    if (top < 10) {
      top = 10;
    }
    
    this.currentPopup.style.left = left + 'px';
    this.currentPopup.style.top = top + 'px';

    document.body.appendChild(this.currentPopup);

    // Add close button functionality
    const closeBtn = this.currentPopup.querySelector('.popup-close');
    closeBtn.addEventListener('click', () => this.removePopup());
  }

  updatePopup(content) {
    if (this.currentPopup) {
      const body = this.currentPopup.querySelector('.popup-body');
      body.innerHTML = content;
    }
  }

  removePopup() {
    if (this.currentPopup) {
      this.currentPopup.remove();
      this.currentPopup = null;
    }
  }
}

// Initialize the content script when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContextAIContent();
  });
} else {
  new ContextAIContent();
}