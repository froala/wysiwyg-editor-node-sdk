function generateId(name) {
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return slug + '-' + Math.random().toString(36).slice(2, 6);
}

document.getElementById('user-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const name = document.getElementById('input-name').value.trim();
  if (!name) {
    document.getElementById('input-name').focus();
    return;
  }

  const role = document.querySelector('input[name="role"]:checked').value;
  const docId = document.getElementById('input-docId').value.trim() || 'demo-doc';
  const id = generateId(name);
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const versionHistory = document.getElementById('toggle-version-history').checked;
  const autoSave = versionHistory && document.getElementById('toggle-autosave').checked;
  const autoSaveInterval = document.getElementById('input-autosave-interval').value;
  const mentionUsers = [...document.querySelectorAll('#mention-list .mention-item')]
    .map(li => li.dataset.name).join(',');

  const params = new URLSearchParams({ id, name, role, docId, mode });
  if (versionHistory) params.set('versionHistory', '1');
  if (autoSave) params.set('autoSave', '1');
  if (autoSave && autoSaveInterval) params.set('autoSaveInterval', autoSaveInterval);
  if (mentionUsers) params.set('mentionUsers', mentionUsers);
  window.location.href = `/collaborative/editor.html?${params}`;
});
