/**
 * Admin camera & photo upload — capture from device camera or pick a file.
 */
(function () {
  'use strict';

  let activeStream = null;
  let modalEl = null;

  function stopStream() {
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      activeStream = null;
    }
  }

  async function uploadImage(dataUrl) {
    const response = await fetch('/admin/api/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Upload failed.');
    }
    return result.url;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
  }

  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.id = 'admin-camera-modal';
    modalEl.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4';
    modalEl.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="camera-modal-title">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 id="camera-modal-title" class="font-display font-bold text-slate-900">Take or Upload Photo</h3>
          <button type="button" data-camera-close class="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="p-5 space-y-4">
          <div data-camera-live class="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3]">
            <video data-camera-video autoplay playsinline muted class="w-full h-full object-cover"></video>
            <canvas data-camera-canvas class="hidden w-full h-full object-cover"></canvas>
            <p data-camera-placeholder class="absolute inset-0 flex items-center justify-center text-white/80 text-sm px-6 text-center">
              Allow camera access, or upload a photo from your device.
            </p>
          </div>
          <p data-camera-status class="text-sm text-slate-500 text-center hidden"></p>
          <div class="flex flex-wrap gap-2 justify-center">
            <button type="button" data-camera-start class="px-4 py-2 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
              Open Camera
            </button>
            <button type="button" data-camera-capture class="hidden px-4 py-2 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-red-700 transition-colors">
              Capture Photo
            </button>
            <label class="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
              Upload File
              <input type="file" data-camera-file accept="image/*" class="sr-only" />
            </label>
            <button type="button" data-camera-retake class="hidden px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Retake
            </button>
            <button type="button" data-camera-use class="hidden px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors">
              Use This Photo
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    modalEl.querySelector('[data-camera-close]').addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalEl.classList.contains('hidden')) closeModal();
    });

    return modalEl;
  }

  function setStatus(message, isError) {
    const statusEl = modalEl.querySelector('[data-camera-status]');
    if (!message) {
      statusEl.classList.add('hidden');
      statusEl.textContent = '';
      return;
    }
    statusEl.textContent = message;
    statusEl.className = `text-sm text-center ${isError ? 'text-red-600' : 'text-slate-500'}`;
  }

  function resetModalView() {
    const video = modalEl.querySelector('[data-camera-video]');
    const canvas = modalEl.querySelector('[data-camera-canvas]');
    const placeholder = modalEl.querySelector('[data-camera-placeholder]');
    modalEl.querySelector('[data-camera-start]').classList.remove('hidden');
    modalEl.querySelector('[data-camera-capture]').classList.add('hidden');
    modalEl.querySelector('[data-camera-retake]').classList.add('hidden');
    modalEl.querySelector('[data-camera-use]').classList.add('hidden');
    video.classList.remove('hidden');
    canvas.classList.add('hidden');
    placeholder.classList.remove('hidden');
    setStatus('');
    stopStream();
    video.srcObject = null;
    modalEl._capturedDataUrl = null;
  }

  function closeModal() {
    if (!modalEl) return;
    resetModalView();
    modalEl.classList.add('hidden');
    modalEl.classList.remove('flex');
    document.body.style.overflow = '';
    modalEl._onComplete = null;
  }

  async function startCamera() {
    const video = modalEl.querySelector('[data-camera-video]');
    const placeholder = modalEl.querySelector('[data-camera-placeholder]');
    setStatus('Starting camera...', false);

    try {
      stopStream();
      activeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = activeStream;
      placeholder.classList.add('hidden');
      modalEl.querySelector('[data-camera-start]').classList.add('hidden');
      modalEl.querySelector('[data-camera-capture]').classList.remove('hidden');
      setStatus('');
    } catch (err) {
      setStatus('Camera unavailable. You can upload a photo instead.', true);
    }
  }

  function capturePhoto() {
    const video = modalEl.querySelector('[data-camera-video]');
    const canvas = modalEl.querySelector('[data-camera-canvas]');
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    modalEl._capturedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    stopStream();
    modalEl.querySelector('[data-camera-capture]').classList.add('hidden');
    modalEl.querySelector('[data-camera-retake]').classList.remove('hidden');
    modalEl.querySelector('[data-camera-use]').classList.remove('hidden');
    setStatus('Preview your photo, then click "Use This Photo".', false);
  }

  function showPreview(dataUrl) {
    const video = modalEl.querySelector('[data-camera-video]');
    const canvas = modalEl.querySelector('[data-camera-canvas]');
    const placeholder = modalEl.querySelector('[data-camera-placeholder]');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      modalEl._capturedDataUrl = dataUrl;
      stopStream();
      video.classList.add('hidden');
      canvas.classList.remove('hidden');
      placeholder.classList.add('hidden');
      modalEl.querySelector('[data-camera-start]').classList.add('hidden');
      modalEl.querySelector('[data-camera-capture]').classList.add('hidden');
      modalEl.querySelector('[data-camera-retake]').classList.remove('hidden');
      modalEl.querySelector('[data-camera-use]').classList.remove('hidden');
      setStatus('Preview your photo, then click "Use This Photo".', false);
    };
    img.src = dataUrl;
  }

  async function usePhoto() {
    const useBtn = modalEl.querySelector('[data-camera-use]');
    const dataUrl = modalEl._capturedDataUrl;
    if (!dataUrl || !modalEl._onComplete) return;

    useBtn.disabled = true;
    useBtn.textContent = 'Uploading...';
    setStatus('Uploading photo...', false);

    try {
      const url = await uploadImage(dataUrl);
      const onComplete = modalEl._onComplete;
      closeModal();
      await onComplete(url);
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      useBtn.disabled = false;
      useBtn.textContent = 'Use This Photo';
    }
  }

  function bindModalActions() {
    if (modalEl._bound) return;
    modalEl._bound = true;

    modalEl.querySelector('[data-camera-start]').addEventListener('click', startCamera);
    modalEl.querySelector('[data-camera-capture]').addEventListener('click', capturePhoto);
    modalEl.querySelector('[data-camera-retake]').addEventListener('click', resetModalView);
    modalEl.querySelector('[data-camera-use]').addEventListener('click', usePhoto);
    modalEl.querySelector('[data-camera-file]').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setStatus('Please select an image file.', true);
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        showPreview(dataUrl);
      } catch (err) {
        setStatus(err.message, true);
      }
    });
  }

  function openCamera(onComplete) {
    ensureModal();
    bindModalActions();
    resetModalView();
    modalEl._onComplete = onComplete;
    modalEl.classList.remove('hidden');
    modalEl.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }

  function updatePreview(previewEl, url) {
    if (!previewEl) return;
    previewEl.replaceChildren();
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Selected photo';
      img.className = 'w-full h-full object-cover';
      previewEl.appendChild(img);
      previewEl.classList.remove('border-dashed', 'text-slate-400');
    } else {
      const span = document.createElement('span');
      span.className = 'text-sm';
      span.textContent = 'No photo yet';
      previewEl.appendChild(span);
      previewEl.classList.add('border-dashed', 'text-slate-400');
    }
  }

  function initWidget(container) {
    const hiddenInput = container.querySelector('[data-photo-url]');
    const previewEl = container.querySelector('[data-photo-preview]');
    const takeBtn = container.querySelector('[data-photo-take]');
    const clearBtn = container.querySelector('[data-photo-clear]');

    if (hiddenInput?.value) {
      updatePreview(previewEl, hiddenInput.value);
    }

    takeBtn?.addEventListener('click', () => {
      openCamera(async (url) => {
        if (hiddenInput) hiddenInput.value = url;
        updatePreview(previewEl, url);
        container.dispatchEvent(new CustomEvent('photo-selected', { detail: { url } }));
      });
    });

    clearBtn?.addEventListener('click', () => {
      if (hiddenInput) hiddenInput.value = '';
      updatePreview(previewEl, '');
      container.dispatchEvent(new CustomEvent('photo-cleared'));
    });
  }

  function initFormSubmit(form) {
    form.addEventListener('submit', (e) => {
      const urlInput = form.querySelector('[data-photo-url]');
      if (urlInput && !urlInput.value.trim()) {
        const optional = form.dataset.photoOptional === 'true';
        if (!optional) {
          e.preventDefault();
          alert('Please take or upload a product photo before saving.');
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-photo-widget]').forEach(initWidget);
    document.querySelectorAll('[data-photo-form]').forEach(initFormSubmit);

    document.querySelectorAll('[data-photo-trigger]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const formId = btn.dataset.photoForm;
        const form = formId ? document.getElementById(formId) : btn.closest('form');
        if (!form) return;

        openCamera(async (url) => {
          const input = form.querySelector('[data-photo-url]');
          if (input) input.value = url;
          form.submit();
        });
      });
    });
  });

  window.AdminCamera = { open: openCamera, uploadImage };
})();
