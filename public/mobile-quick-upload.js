(function () {
  const root = document.querySelector('[data-mobile-quick-upload]');
  if (!root) return;

  const endpoint = root.dataset.uploadEndpoint;
  const status = root.querySelector('[data-mobile-upload-status]');
  const setStatus = (message, state = 'muted') => {
    if (!status) return;
    status.className = `small mt-2 text-${state}`;
    status.textContent = message;
  };

  const uploadFiles = async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    setStatus(`Uploading ${selected.length} file${selected.length > 1 ? 's' : ''}...`, 'muted');

    try {
      for (const file of selected) {
        const formData = new FormData();
        formData.append('file', file, file.name || 'mobile-upload');
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        if (!response.ok) {
          let detail = `Upload failed (${response.status})`;
          try {
            const data = await response.json();
            detail = data.description || data.error || detail;
          } catch {
            // The API may return an HTML error page, keep the status message.
          }
          throw new Error(detail);
        }
      }

      setStatus('Upload complete. Refreshing attachments...', 'success');
      window.location.hash = 'filesDiv';
      window.location.reload();
    } catch (error) {
      setStatus(error.message || 'Upload failed.', 'danger');
    }
  };

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-mobile-upload-trigger]');
    if (!trigger) return;
    const input = root.querySelector(`[data-mobile-upload-input="${trigger.dataset.mobileUploadTrigger}"]`);
    if (input) input.click();
  });

  root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-mobile-upload-input]');
    if (!input) return;
    uploadFiles(input.files).finally(() => {
      input.value = '';
    });
  });
})();
