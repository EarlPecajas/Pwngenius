const flagForm = document.querySelector('#flag-form');
const flagInput = document.querySelector('#flag-input');
const formStatus = document.querySelector('#form-status');

flagForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = flagInput.value.trim();
  if (!value) {
    formStatus.textContent = 'ERROR // ENTER A FLAG STRING TO TRANSMIT';
    formStatus.className = 'form-status error';
    return;
  }

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag: value })
    });
    const result = await response.json();
    if (result.correct) {
      formStatus.textContent = 'CORRECT // FLAG ACCEPTED';
      formStatus.className = 'form-status success';
      flagInput.value = '';
      return;
    }
  } catch {
    formStatus.textContent = 'ERROR // SUBMISSION SERVICE UNAVAILABLE';
    formStatus.className = 'form-status error';
    return;
  }

  formStatus.textContent = 'INCORRECT // FLAG REJECTED';
  formStatus.className = 'form-status error';
});
