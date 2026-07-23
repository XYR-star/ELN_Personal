document.documentElement.classList.add('resource-workspace-pending');

window.setTimeout(() => {
  document.documentElement.classList.remove('resource-workspace-pending');
}, 4000);
