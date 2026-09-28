const params = new URLSearchParams(location.search);
const form = document.getElementById('form');
const input = document.getElementById('server');
const error = document.getElementById('error');
const button = document.getElementById('connect');

input.value = params.get('server') || '';
input.select();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  button.disabled = true;
  input.disabled = true;
  button.textContent = 'Connecting…';
  const result = await window.jellioNative.connect(input.value);
  if (result.ok) return;
  error.textContent = result.error;
  button.disabled = false;
  input.disabled = false;
  button.textContent = 'Connect';
  input.focus();
});
