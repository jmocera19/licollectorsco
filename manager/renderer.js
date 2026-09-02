// =============================================
// TAB SWITCHING
// =============================================
function switchTab(tab) {
  const panels = ['inventory', 'blog'];
  panels.forEach(p => {
    const panel = document.getElementById(`panel-${p}`);
    const btn = document.getElementById(`tab-${p}`);
    if (p === tab) {
      panel.classList.remove('hidden');
      panel.classList.add('flex');
      btn.classList.add('text-gold', 'border-gold');
      btn.classList.remove('text-gray-400', 'border-transparent');
    } else {
      panel.classList.add('hidden');
      panel.classList.remove('flex');
      btn.classList.remove('text-gold', 'border-gold');
      btn.classList.add('text-gray-400', 'border-transparent');
    }
  });
  if (tab === 'blog') refreshBlogPosts();
}

// =============================================
// INVENTORY PANEL
// =============================================
const vaultGrid = document.getElementById('vault-grid');
const addBtn = document.getElementById('add-btn');
const ebayInput = document.getElementById('ebay-input');
const syncBtn = document.getElementById('sync-btn');
const addStatus = document.getElementById('add-status');
const syncStatus = document.getElementById('sync-status');

const MISSING_IMAGE_PLACEHOLDER = 'https://via.placeholder.com/150/000000/D4AF37?text=Missing';
let importPending = false;
let syncPending = false;

// Helper to escape output strings safely
const escapeHTML = (str) => {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag])
  );
}

// Centralized control ownership: while either operation is pending, Import,
// Sync, and every rendered Remove button are disabled. Handlers change only
// their own pending flag and call this after every flag change.
const updateControlState = () => {
  const busy = importPending || syncPending;
  addBtn.disabled = busy;
  syncBtn.disabled = busy;
  vaultGrid.querySelectorAll('button[data-action="remove-vault-item"]').forEach((button) => {
    button.disabled = busy;
  });
};

// Status ownership: every update increments a generation and cancels any
// scheduled auto-clear; a scheduled clear fires only while its own generation
// is still current, so a stale success timer can never erase a newer error.
const createStatusController = (element, idleClassName, successDelayMs) => {
  let generation = 0;
  let timer = null;

  const cancelTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    show(text, colorClass, autoClear = false) {
      generation += 1;
      cancelTimer();
      element.innerText = text;
      element.className = `text-sm font-medium ${colorClass}`;
      if (autoClear) {
        const currentGeneration = generation;
        timer = setTimeout(() => {
          timer = null;
          if (generation === currentGeneration) {
            element.innerText = '';
            element.className = `text-sm font-medium ${idleClassName}`;
          }
        }, successDelayMs);
      }
    },
    clear() {
      generation += 1;
      cancelTimer();
      element.innerText = '';
      element.className = `text-sm font-medium ${idleClassName}`;
    },
  };
};

const addStatusController = createStatusController(addStatus, 'text-gold ml-4', 4000);
const syncStatusController = createStatusController(syncStatus, 'text-gray-400', 5000);

async function refreshVaultData() {
  const data = await window.api.readVault();

  vaultGrid.innerHTML = '';

  if (data.status === 'error') {
    vaultGrid.innerHTML = `<p class="text-red-500 text-center py-10">Could not load the vault: ${escapeHTML(data.message)}</p>`;
    return;
  }

  const items = data.vault || [];

  if (items.length === 0) {
    vaultGrid.innerHTML = '<p class="text-gray-500 italic text-center py-10">Vault is empty. Add eBay items to populate.</p>';
    return;
  }
  
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = "flex justify-between items-center bg-navy border border-gold/10 p-4 rounded-lg shadow hover:border-gold/30 transition-colors";
    card.innerHTML = `
      <div class="flex items-center gap-6 overflow-hidden">
        <div class="w-16 h-16 bg-black rounded flex-shrink-0 flex items-center justify-center overflow-hidden border border-gold/20">
          <img src="${escapeHTML(item.image)}" class="object-cover w-full h-full" />
        </div>
        <div class="flex flex-col truncate pr-4">
          <h3 class="font-bold text-gray-200 truncate pr-4 text-sm md:text-base">${escapeHTML(item.title)}</h3>
          <div class="flex gap-4 text-xs text-gray-400 mt-1">
            <span class="text-green-400 font-bold">${escapeHTML(item.price)}</span>
            <span>ID: ${escapeHTML(item.id)}</span>
          </div>
        </div>
      </div>
      <button type="button" data-action="remove-vault-item" class="bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/50 py-1.5 px-4 rounded text-sm font-bold transition-colors flex-shrink-0">
        Remove
      </button>
    `;

    const image = card.querySelector('img');
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied) return;
      image.dataset.fallbackApplied = 'true';
      image.src = MISSING_IMAGE_PLACEHOLDER;
    });

    const removeButton = card.querySelector('button[data-action="remove-vault-item"]');
    removeButton.disabled = importPending || syncPending;
    removeButton.addEventListener('click', () => handleRemove(item.id, item.title));

    vaultGrid.appendChild(card);
  });
}

const handleRemove = async (id, title) => {
  if (!window.confirm(`Remove "${title}" (eBay item ID ${id}) from the vault?`)) return;
  const attempt = await window.api.removeVaultItem(id);
  if (attempt.success) {
    refreshVaultData();
  } else {
    alert(`Delete failed: ${attempt.message || attempt.error || 'Unknown error.'}`);
    if (attempt.error === 'not-found') refreshVaultData();
  }
};

addBtn.addEventListener('click', async () => {
  const idValue = ebayInput.value.trim();
  if (!idValue) return;
  if (importPending || syncPending) return;

  importPending = true;
  updateControlState();
  addBtn.innerText = "Processing...";
  addBtn.classList.remove('bg-gold');
  addBtn.classList.add('bg-gray-500');
  addStatusController.show("Contacting eBay...", 'text-gold');

  try {
    const res = await window.api.addVaultItem(idValue);

    if (res.success) {
      addStatusController.show(res.item && res.item.title ? `Imported "${res.item.title}".` : "Successfully imported!", 'text-green-500', true);
      ebayInput.value = '';
      refreshVaultData();
    } else {
      addStatusController.show(res.message || "Import failed. See Console.", 'text-red-500');
      console.error("Import Error:", res.error, res.reason, res.detail);
    }
  } catch (error) {
    addStatusController.show("Import failed unexpectedly. See Console.", 'text-red-500');
    console.error("Import Error:", error);
  } finally {
    importPending = false;
    addBtn.innerText = "Import Item";
    addBtn.classList.add('bg-gold');
    addBtn.classList.remove('bg-gray-500');
    updateControlState();
  }
});

syncBtn.addEventListener('click', async () => {
  if (syncPending || importPending) return;

  syncPending = true;
  updateControlState();
  syncBtn.innerText = "Syncing...";
  syncBtn.classList.replace('bg-green-600', 'bg-blue-600');
  syncBtn.classList.replace('hover:bg-green-500', 'hover:bg-blue-500');
  syncStatusController.clear();

  try {
    const res = await window.api.syncLive();
    const hint = res.hint ? ` ${res.hint}` : '';

    if (res.status === 'deployed') {
      syncStatusController.show(`Live Deployment Running! Commit ${res.commitHash}.`, 'text-green-400', true);
      console.log("Git Push Stdout:", res.stdout);
    } else if (res.status === 'no-changes') {
      syncStatusController.show("Already Up To Date.", 'text-yellow-500', true);
    } else if (res.status === 'cancelled') {
      syncStatusController.show(res.message, 'text-yellow-500', true);
    } else if (res.status === 'blocked' || res.status === 'changed-during-confirmation') {
      syncStatusController.show(`${res.message}${hint}`, 'text-red-500');
      console.error("Sync blocked:", res);
    } else if (res.status === 'commit-failed') {
      syncStatusController.show(`${res.message}${hint}`, 'text-red-500');
      console.error("Commit Error:", res.detail, res.cleanup);
    } else if (res.status === 'committed-not-pushed') {
      syncStatusController.show(`${res.message}${hint}`, 'text-red-500');
      console.error("Local Commit Not Pushed:", res.error, res.detail, res.stderr);
    } else if (res.status === 'committed-push-failed') {
      syncStatusController.show(`${res.message}${hint}`, 'text-red-500');
      console.error("Push Error:", res.detail, res.stderr);
    } else if (res.status === 'error') {
      syncStatusController.show(`Sync failed at ${res.step}.${hint}`, 'text-red-500');
      console.error("Sync Error:", res.message, res.detail, res.stderr);
    } else {
      syncStatusController.show("Sync returned an unexpected result. See console.", 'text-red-500');
      console.error("Unexpected Sync Result:", res);
    }
  } catch (error) {
    syncStatusController.show("Sync failed unexpectedly. See console.", 'text-red-500');
    console.error("Sync Error:", error);
  } finally {
    syncPending = false;
    syncBtn.innerText = "Sync to Live Site";
    syncBtn.classList.replace('bg-blue-600', 'bg-green-600');
    syncBtn.classList.replace('hover:bg-blue-500', 'hover:bg-green-500');
    updateControlState();
  }
});

// =============================================
// BLOG EDITOR PANEL
// =============================================
const blogTitle = document.getElementById('blog-title');
const blogSlug = document.getElementById('blog-slug');
const blogTags = document.getElementById('blog-tags');
const blogExcerpt = document.getElementById('blog-excerpt');
const blogBody = document.getElementById('blog-body');
const blogPublishBtn = document.getElementById('blog-publish-btn');
const blogClearBtn = document.getElementById('blog-clear-btn');
const blogStatus = document.getElementById('blog-status');
const blogPostsList = document.getElementById('blog-posts-list');

// Auto-slugify title → slug field
blogTitle.addEventListener('input', () => {
  const raw = blogTitle.value;
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  blogSlug.value = slug;
});

const SLUG_FORMAT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Success messages may clear automatically; errors persist until the next
// successful action replaces them.
const blogStatusController = createStatusController(blogStatus, 'text-gold', 5000);

// Publish / save post
blogPublishBtn.addEventListener('click', async () => {
  const payload = {
    title: blogTitle.value.trim(),
    slug: blogSlug.value.trim(),
    excerpt: blogExcerpt.value.trim(),
    body: blogBody.value.trim(),
    tags: blogTags.value
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
  };

  if (!payload.title || !payload.slug || !payload.excerpt || !payload.body) {
    blogStatusController.show('Title, slug, excerpt, and body are required.', 'text-red-400');
    return;
  }

  if (!SLUG_FORMAT_RE.test(payload.slug) || payload.slug.length > 80) {
    blogStatusController.show('Slug must be lowercase letters, numbers, or single hyphens.', 'text-red-400');
    return;
  }

  blogPublishBtn.disabled = true;
  blogPublishBtn.innerText = 'Publishing...';

  try {
    let res = await window.api.publishPost(payload, { overwrite: false });

    if (res.status === 'conflict') {
      const existing = res.existing || {};
      const confirmed = window.confirm(
        `A post already exists at "/blog/${res.slug}" — "${existing.title || res.slug}" (published ${existing.date || 'unknown date'}). ` +
        'Replace its content? The original publication date will be kept.'
      );
      if (!confirmed) return;
      res = await window.api.publishPost(payload, { overwrite: true });
    }

    if (res.status === 'published') {
      blogStatusController.show(res.created ? '✅ Post published!' : '✅ Post replaced. Original publication date kept.', 'text-green-400', true);
      clearBlogForm();
      refreshBlogPosts();
    } else if (res.status === 'invalid') {
      blogStatusController.show(`Error: ${(res.errors && res.errors.join(' ')) || res.message || 'The post could not be validated.'}`, 'text-red-400');
    } else if (res.status === 'error') {
      blogStatusController.show(`Error: ${res.message || 'Publishing failed.'}`, 'text-red-400');
      console.error('Publish Error:', res);
    } else {
      blogStatusController.show('Unexpected result. See console.', 'text-red-400');
      console.error('Unexpected Publish Result:', res);
    }
  } catch (error) {
    blogStatusController.show('Publish failed unexpectedly. See console.', 'text-red-400');
    console.error('Publish Error:', error);
  } finally {
    blogPublishBtn.disabled = false;
    blogPublishBtn.innerText = 'Publish Post';
  }
});

blogClearBtn.addEventListener('click', clearBlogForm);

function clearBlogForm() {
  blogTitle.value = '';
  blogSlug.value = '';
  blogTags.value = '';
  blogExcerpt.value = '';
  blogBody.value = '';
}

async function refreshBlogPosts() {
  const data = await window.api.readPosts();

  blogPostsList.innerHTML = '';

  if (data.status === 'error') {
    blogPostsList.innerHTML = `<p class="text-red-500 text-center py-6">Could not load posts: ${escapeHTML(data.message)}</p>`;
    return;
  }

  const posts = data.posts || [];

  if (posts.length === 0) {
    blogPostsList.innerHTML = '<p class="text-gray-500 italic text-center py-6">No posts yet.</p>';
    return;
  }

  posts.forEach(post => {
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center bg-navy border border-gold/10 p-4 rounded-lg hover:border-gold/30 transition-colors';
    row.innerHTML = `
      <div class="flex flex-col overflow-hidden pr-4">
        <span class="font-bold text-gray-200 truncate text-sm">${escapeHTML(post.title)}</span>
        <span class="text-xs text-gray-500 mt-0.5">${escapeHTML(post.date)} · ${(post.tags || []).map(t => escapeHTML(t)).join(', ')}</span>
      </div>
      <button type="button" data-action="delete-post" class="bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/50 py-1.5 px-4 rounded text-sm font-bold transition-colors flex-shrink-0">
        Delete
      </button>
    `;

    const deleteButton = row.querySelector('button[data-action="delete-post"]');
    deleteButton.addEventListener('click', () => handleDeletePost(post.slug, post.title));

    blogPostsList.appendChild(row);
  });
}

const handleDeletePost = async (slug, title) => {
  if (!window.confirm(`Delete "${title}" (/blog/${slug})? This cannot be undone.`)) return;
  const res = await window.api.deletePost(slug);
  if (res.status === 'deleted') {
    refreshBlogPosts();
  } else if (res.status === 'not-found') {
    alert(res.message || 'That post no longer exists.');
    refreshBlogPosts();
  } else {
    alert(`Delete failed: ${res.message || 'Unknown error.'}`);
  }
};

// =============================================
// BOOT
// =============================================
refreshVaultData();
