/**
 * Auth Page HTML Templates
 *
 * Simple HTML templates for the AWP auth flow.
 * In production, replace with your own authentication system.
 */

/**
 * Generate the authorization confirmation page HTML
 *
 * This page is shown to logged-in users to confirm authorization of a client.
 */
export function getAuthPageHtml(
  error?: string,
  clientName?: string,
  verificationCode?: string
): string {
  const displayClientName = clientName ?? "Unknown Client";
  const displayCode = verificationCode ?? "---";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize ${displayClientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      width: 100%;
      max-width: 450px;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 8px;
      text-align: center;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
      text-align: center;
      margin-bottom: 30px;
    }
    .client-info {
      background: #f8f9ff;
      border: 1px solid #e0e4ff;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: center;
    }
    .client-name {
      font-size: 20px;
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }
    .client-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .verification-code {
      background: #f0f4ff;
      border: 2px dashed #667eea;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      margin-bottom: 24px;
    }
    .verification-code label {
      display: block;
      color: #666;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .verification-code .code {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 28px;
      font-weight: bold;
      color: #667eea;
      letter-spacing: 4px;
    }
    .verification-code .hint {
      font-size: 12px;
      color: #888;
      margin-top: 8px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #333;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 6px;
    }
    select {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      background: white;
      cursor: pointer;
    }
    select:focus {
      outline: none;
      border-color: #667eea;
    }
    .buttons {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 14px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button.primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    button.primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    button.secondary {
      background: #f5f5f5;
      color: #666;
    }
    button.secondary:hover {
      background: #eee;
    }
    .error {
      background: #fff0f0;
      border: 1px solid #ffcdd2;
      color: #c62828;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .warning {
      background: #fff8e1;
      border: 1px solid #ffe082;
      color: #f57c00;
      padding: 12px;
      border-radius: 8px;
      margin-top: 20px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorize Application</h1>
    <p class="subtitle">A client is requesting access to your account</p>
    
    <div class="client-info">
      <div class="client-label">Client Name</div>
      <div class="client-name">${displayClientName}</div>
    </div>
    
    <div class="verification-code">
      <label>Verification Code</label>
      <div class="code">${displayCode}</div>
      <div class="hint">Verify this code matches what your client is showing</div>
    </div>
    
    ${error ? `<div class="error">${error}</div>` : ""}
    
    <form id="auth-form">
      <input type="hidden" id="pubkey" value="">
      <input type="hidden" id="verification_code" value="${displayCode}">
      
      <div class="form-group">
        <label for="expires_in">Authorization Duration</label>
        <select id="expires_in" name="expires_in">
          <option value="86400">1 day</option>
          <option value="604800">7 days</option>
          <option value="2592000" selected>30 days</option>
          <option value="7776000">90 days</option>
          <option value="">Never expires</option>
        </select>
      </div>
      
      <div class="buttons">
        <button type="button" class="secondary" onclick="window.close()">Deny</button>
        <button type="submit" class="primary">Authorize</button>
      </div>
    </form>
    
    <div class="warning">
      ⚠️ Only authorize applications you trust. This client will be able to access tools on your behalf.
    </div>
  </div>
  
  <script>
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const pubkey = params.get('pubkey') || '';
    document.getElementById('pubkey').value = pubkey;
    
    // Handle form submission
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const expiresInValue = document.getElementById('expires_in').value;
      const body = {
        pubkey: document.getElementById('pubkey').value,
        verification_code: document.getElementById('verification_code').value,
      };
      if (expiresInValue) {
        body.expires_in = parseInt(expiresInValue, 10);
      }
      
      try {
        const response = await fetch('/api/auth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        
        if (response.ok) {
          window.location.href = '/api/auth/success';
        } else {
          const data = await response.json();
          alert(data.error_description || 'Authorization failed');
        }
      } catch (err) {
        alert('Network error. Please try again.');
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Generate the success page HTML
 */
export function getAuthSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Complete</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 60px 40px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    .checkmark {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .checkmark svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
      fill: none;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.5;
    }
    .note {
      margin-top: 24px;
      padding: 16px;
      background: #f0fdf4;
      border-radius: 8px;
      color: #166534;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">
      <svg viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>Authorization Complete!</h1>
    <p>The MCP client has been authorized. You can close this window and return to your application.</p>
    <div class="note">
      The client is now polling for authorization status and will automatically detect this approval.
    </div>
  </div>
</body>
</html>`;
}
