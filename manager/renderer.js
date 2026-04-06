// DOM Elements
const vaultGrid = document.getElementById('vault-grid');
const addBtn = document.getElementById('add-btn');
const ebayInput = document.getElementById('ebay-input');
const syncBtn = document.getElementById('sync-btn');
const addStatus = document.getElementById('add-status');
const syncStatus = document.getElementById('sync-status');

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

// Global Core Loader
async function refreshVaultData() {
  const data = await window.api.readVault();
  const items = data.vault || [];
  
  vaultGrid.innerHTML = '';
  
  if (items.length === 0) {
    vaultGrid.innerHTML = '<p class="text-gray-500 italic text-center py-10">Vault is empty. Add eBay items to populate.</p>';
    return;
  }
  
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = "flex justify-between items-center bg-navy border border-gold/10 p-4 rounded-lg shadow hover:border-gold/30 transition-colors";
    
    // Natively injecting HTML fragments securely. Image fallback mapped natively!
    card.innerHTML = `
      <div class="flex items-center gap-6 overflow-hidden">
        <div class="w-16 h-16 bg-black rounded flex-shrink-0 flex items-center justify-center overflow-hidden border border-gold/20">
          <img src="${escapeHTML(item.image)}" class="object-cover w-full h-full" onerror="this.src='https://via.placeholder.com/150/000000/D4AF37?text=Missing'" />
        </div>
        <div class="flex flex-col truncate pr-4">
          <h3 class="font-bold text-gray-200 truncate pr-4 text-sm md:text-base">${escapeHTML(item.title)}</h3>
          <div class="flex gap-4 text-xs text-gray-400 mt-1">
            <span class="text-green-400 font-bold">${escapeHTML(item.price)}</span>
            <span>ID: ${escapeHTML(item.id)}</span>
          </div>
        </div>
      </div>
      <button onclick="handleRemove('${escapeHTML(item.id)}')" class="bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/50 py-1.5 px-4 rounded text-sm font-bold transition-colors flex-shrink-0">
        Remove
      </button>
    `;
    vaultGrid.appendChild(card);
  });
}

// Global scope window router for the inline onClick commands to operate outside closure restrictions
window.handleRemove = async (id) => {
  const attempt = await window.api.removeVaultItem(id);
  if (attempt.success) {
    refreshVaultData();
  } else {
    alert("Delete failed: " + attempt.error);
  }
};

addBtn.addEventListener('click', async () => {
  const idValue = ebayInput.value.trim();
  if (!idValue) return;

  addBtn.disabled = true;
  addBtn.innerText = "Processing...";
  addBtn.classList.remove('bg-gold');
  addBtn.classList.add('bg-gray-500');
  addStatus.innerText = "Scraping eBay...";

  const res = await window.api.addVaultItem(idValue);
  
  if (res.success) {
    addStatus.innerText = "Successfully imported!";
    addStatus.classList.replace('text-red-500', 'text-green-500');
    if (!addStatus.classList.contains('text-green-500')) { addStatus.classList.add('text-green-500'); addStatus.classList.remove('text-gold'); }
    ebayInput.value = '';
    refreshVaultData(); // Update screen!
  } else {
    addStatus.innerText = "Error: See Console";
    addStatus.classList.replace('text-green-500', 'text-red-500');
    if (!addStatus.classList.contains('text-red-500')) { addStatus.classList.add('text-red-500'); addStatus.classList.remove('text-gold'); }
    console.error("Scraper Error:", res.error, res.stderr);
  }

  addBtn.disabled = false;
  addBtn.innerText = "Import Item";
  addBtn.classList.add('bg-gold');
  addBtn.classList.remove('bg-gray-500');

  // Fade out message
  setTimeout(() => { addStatus.innerText = ''; addStatus.className="text-sm font-medium text-gold ml-4"; }, 4000);
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.innerText = "Pushing to GitHub...";
  syncBtn.classList.replace('bg-green-600', 'bg-blue-600');
  syncBtn.classList.replace('hover:bg-green-500', 'hover:bg-blue-500');
  syncStatus.innerText = "";
  
  const res = await window.api.syncLive();

  if (res.success) {
    syncStatus.innerText = "Live Deployment Running!";
    syncStatus.className = "text-sm font-medium text-green-400";
    console.log("Git Push Stdout:", res.stdout);
  } else {
    // If output says 'nothing to commit', print that explicitly
    if (res.stdout && res.stdout.includes('nothing to commit')) {
        syncStatus.innerText = "Already Up To Date.";
        syncStatus.className = "text-sm font-medium text-yellow-500";
    } else {
        syncStatus.innerText = "Sync Failed. See console.";
        syncStatus.className = "text-sm font-medium text-red-500";
        console.error("Sync Error:", res.error, res.stderr);
    }
  }

  syncBtn.disabled = false;
  syncBtn.innerText = "Sync to Live Site";
  syncBtn.classList.replace('bg-blue-600', 'bg-green-600');
  syncBtn.classList.replace('hover:bg-blue-500', 'hover:bg-green-500');

  setTimeout(() => { syncStatus.innerText = ''; }, 5000);
});

// Boot Action!
refreshVaultData();
