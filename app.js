// Global state
let allRecipes = [];
let myRecipes = [];
let recipePhotos = {};
let favorites = new Set();
let currentFilter = 'all';
let showFavoritesOnly = false;
let editingRecipeId = null;
let uploadedImages = [];
let db = null;

const DB_NAME = 'FujiRecipeHubOriginal';
const DB_VERSION = 2;
const STORE_NAME = 'myrecipes';
const PHOTO_STORE = 'recipe_photos';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const tabButtons = document.querySelectorAll('.tab-btn');
const favToggleBtn = document.getElementById('favToggleBtn');
const favCountEl = document.getElementById('favCount');
const resultCountEl = document.getElementById('resultCount');
const recipeGrid = document.getElementById('recipeGrid');

// Modal Elements
const recipeModal = document.getElementById('recipeModal');
const modalClose = document.getElementById('modalClose');
const modalImage = document.getElementById('modalImage');
const imageFallback = document.querySelector('.image-fallback');
const modalTitle = document.getElementById('modalTitle');
const modalGenTag = document.getElementById('modalGenTag');
const modalSimTag = document.getElementById('modalSimTag');
const cameraMenu = document.getElementById('cameraMenu');

// Create Modal Elements
const createModal = document.getElementById('createModal');
const createModalClose = document.getElementById('createModalClose');
const createModalTitle = document.getElementById('createModalTitle');
const createRecipeBtn = document.getElementById('createRecipeBtn');
const saveRecipeBtn = document.getElementById('saveRecipeBtn');
const cancelCreateBtn = document.getElementById('cancelCreateBtn');
const deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
const imageUploadArea = document.getElementById('imageUploadArea');
const myRecipeImageInput = document.getElementById('myRecipeImage');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadPreviewList = document.getElementById('uploadPreviewList');

// Setting Key Label Mapping
const settingLabels = {
    'film_simulation': 'フィルムシミュレーション',
    'dynamic_range': 'ダイナミックレンジ',
    'grain_effect': 'グレイン・エフェクト',
    'grain_size': 'グレイン・サイズ',
    'color_chrome_effect': 'カラークローム・エフェクト',
    'color_chrome_fx_blue': 'カラークローム・ブルー',
    'white_balance': 'ホワイトバランス',
    'highlight_tone': 'ハイライトトーン',
    'shadow_tone': 'シャドウトーン',
    'color': 'カラー',
    'sharpness': 'シャープネス',
    'noise_reduction': 'ノイズリダクション',
    'clarity': 'クラリティ',
    'exposure_compensation': '露出補正'
};

// ===== IndexedDB =====
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(PHOTO_STORE)) {
                database.createObjectStore(PHOTO_STORE, { keyPath: 'recipeId' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

function dbGetAll() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function dbPut(recipe) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(recipe);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function dbDelete(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// ===== Recipe Photos DB =====
function photoGetAll() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readonly');
        const store = tx.objectStore(PHOTO_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function photoPut(recipeId, images) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readwrite');
        const store = tx.objectStore(PHOTO_STORE);
        const request = store.put({ recipeId, images });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function photoDelete(recipeId) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readwrite');
        const store = tx.objectStore(PHOTO_STORE);
        const request = store.delete(recipeId);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

async function loadRecipePhotos() {
    try {
        const all = await photoGetAll();
        recipePhotos = {};
        all.forEach(entry => {
            recipePhotos[entry.recipeId] = entry.images;
        });
    } catch (e) {
        console.error('Error loading recipe photos:', e);
        recipePhotos = {};
    }
}

// ===== Font Size =====
function setFontSize(size) {
    document.body.classList.remove('font-small', 'font-large');
    if (size === 'small') document.body.classList.add('font-small');
    else if (size === 'large') document.body.classList.add('font-large');
    localStorage.setItem('fuji_fontsize', size);
    document.querySelectorAll('.fontsize-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === size);
    });
}

(function restoreFontSize() {
    const saved = localStorage.getItem('fuji_fontsize');
    if (saved && saved !== 'medium') setFontSize(saved);
})();

// ===== Backup / Restore =====
async function exportBackup() {
    try {
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            favorites: Array.from(favorites),
            myRecipes: myRecipes,
            recipePhotos: recipePhotos
        };
        const json = JSON.stringify(data);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fuji-recipe-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('バックアップの作成に失敗しました: ' + e.message);
    }
}

function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data.version || !data.favorites) {
                alert('無効なバックアップファイルです。');
                return;
            }
            if (!confirm('現在のデータを上書きして復元しますか？')) return;

            favorites = new Set(data.favorites || []);
            localStorage.setItem('fuji_favorites_original', JSON.stringify(Array.from(favorites)));

            if (data.myRecipes && data.myRecipes.length > 0) {
                for (const recipe of data.myRecipes) {
                    await dbPut(recipe);
                }
                myRecipes = data.myRecipes;
            }

            if (data.recipePhotos) {
                for (const [recipeId, images] of Object.entries(data.recipePhotos)) {
                    await photoPut(recipeId, images);
                }
                recipePhotos = data.recipePhotos;
            }

            renderCards();
            updateFavCount();
            alert('復元が完了しました！');
        } catch (err) {
            alert('復元に失敗しました: ' + err.message);
        }
    };
    input.click();
}

// ===== Image Helpers =====
function readFileAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

async function compressImage(dataUrl, maxWidth = 800) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;
            if (w > maxWidth) {
                h = (maxWidth / w) * h;
                w = maxWidth;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    });
}

// ===== Initialize Application =====
async function init() {
    loadFavorites();
    updateFavCounter();
    await openDB();
    await loadMyRecipes();
    await loadRecipePhotos();
    await fetchRecipes();
    setupEventListeners();
}

async function loadMyRecipes() {
    try {
        myRecipes = await dbGetAll();
    } catch (e) {
        console.error('Error loading my recipes:', e);
        myRecipes = [];
    }
}

// Fetch Recipes Data
async function fetchRecipes() {
    try {
        const response = await fetch('recipes.json');
        if (!response.ok) {
            throw new Error(`Failed to load database: ${response.statusText}`);
        }
        allRecipes = await response.json();

        allRecipes = allRecipes.map((recipe, index) => ({
            id: `recipe-${index}`,
            ...recipe
        }));

        renderRecipes();
    } catch (error) {
        console.error('Error fetching recipes:', error);
        recipeGrid.innerHTML = `
            <div class="loading-spinner-wrapper">
                <p style="color: var(--danger-red); font-weight: 600;">データベースのロードに失敗しました</p>
                <p style="font-size: 0.85rem; margin-top: 0.5rem;">${error.message}</p>
            </div>
        `;
    }
}

// Get combined recipe list
function getCombinedRecipes() {
    const myMapped = myRecipes.map(r => ({
        ...r,
        generation: 'myrecipe',
        isMyRecipe: true
    }));
    return [...allRecipes, ...myMapped];
}

// Render Recipe Cards Grid
function renderRecipes() {
    const query = searchInput.value.toLowerCase().trim();
    const combined = getCombinedRecipes();

    const filteredRecipes = combined.filter(recipe => {
        if (currentFilter === 'myrecipe') {
            if (!recipe.isMyRecipe) return false;
        } else if (currentFilter !== 'all') {
            if (recipe.isMyRecipe) return false;
            if (recipe.generation !== currentFilter) return false;
        }

        if (showFavoritesOnly && !favorites.has(recipe.id)) return false;

        if (query) {
            const inTitle = recipe.title.toLowerCase().includes(query);
            const inSim = (recipe.settings.film_simulation || '').toLowerCase().includes(query);
            let inSettings = false;
            for (const key in recipe.settings) {
                if ((recipe.settings[key] || '').toLowerCase().includes(query)) {
                    inSettings = true;
                    break;
                }
            }
            return inTitle || inSim || inSettings;
        }

        return true;
    });

    if (filteredRecipes.length === 0) {
        const emptyMsg = currentFilter === 'myrecipe'
            ? 'マイレシピがまだありません。「マイレシピ作成」ボタンから追加できます。'
            : '一致するレシピが見つかりませんでした';
        resultCountEl.textContent = emptyMsg;
        recipeGrid.innerHTML = `
            <div class="loading-spinner-wrapper">
                <p>${emptyMsg}</p>
            </div>
        `;
        return;
    }

    resultCountEl.textContent = `${filteredRecipes.length} 件のレシピが見つかりました`;

    recipeGrid.innerHTML = filteredRecipes.map(recipe => {
        const isFav = favorites.has(recipe.id);
        const isMyRecipe = recipe.isMyRecipe;
        const userPhotos = recipePhotos[recipe.id];

        let imageHtml;
        if (isMyRecipe && recipe.images && recipe.images.length > 0) {
            imageHtml = `<img src="${recipe.images[0]}" alt="${recipe.title}" loading="lazy">`;
        } else if (userPhotos && userPhotos.length > 0) {
            imageHtml = `<img src="${userPhotos[0]}" alt="${recipe.title}" loading="lazy">`;
        } else if (recipe.imageUrl) {
            imageHtml = `<img src="${recipe.imageUrl}" alt="${recipe.title}" loading="lazy">`;
        } else {
            imageHtml = `<div class="card-img-placeholder"><span>NO PHOTO</span></div>`;
        }

        const badgeLabel = isMyRecipe ? 'MY' : recipe.generation;
        const badgeClass = isMyRecipe ? 'card-gen my-recipe-badge' : 'card-gen';
        const baseSim = recipe.settings.film_simulation || 'Unknown Sim';

        const editBtn = isMyRecipe ? `
            <button class="card-edit-btn" data-myid="${recipe.id}" title="編集">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
            </button>` : '';

        const uploadBtn = !isMyRecipe ? `
            <button class="card-upload-btn" data-id="${recipe.id}" title="作例写真をアップロード">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </button>` : '';

        return `
            <div class="recipe-card" data-id="${recipe.id}" ${isMyRecipe ? 'data-myrecipe="true"' : ''}>
                <div class="card-image-area">
                    ${imageHtml}
                    ${editBtn}
                    ${uploadBtn}
                    <button class="card-fav-btn ${isFav ? 'active' : ''}" data-id="${recipe.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                    </button>
                </div>
                <div class="card-body">
                    <div>
                        <div class="card-meta-top">
                            <span class="${badgeClass}">${badgeLabel}</span>
                        </div>
                        <h3 class="card-title">${recipe.title}</h3>
                    </div>
                    <div class="card-bottom">
                        <span class="card-sim">${baseSim}</span>
                        <svg class="card-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    setupCardClicks();
}

// Setup Card Click Event Handlers
function setupCardClicks() {
    document.querySelectorAll('.recipe-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.card-fav-btn') || e.target.closest('.card-edit-btn') || e.target.closest('.card-upload-btn')) return;
            const recipeId = card.getAttribute('data-id');
            const isMyRecipe = card.getAttribute('data-myrecipe') === 'true';

            if (isMyRecipe) {
                const recipe = myRecipes.find(r => r.id === recipeId);
                if (recipe) openModal({ ...recipe, generation: 'myrecipe', isMyRecipe: true });
            } else {
                const recipe = allRecipes.find(r => r.id === recipeId);
                if (recipe) openModal(recipe);
            }
        });
    });

    document.querySelectorAll('.card-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            toggleFavorite(id);
        });
    });

    document.querySelectorAll('.card-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const myId = btn.getAttribute('data-myid');
            const recipe = myRecipes.find(r => r.id === myId);
            if (recipe) openCreateModal(recipe);
        });
    });

    document.querySelectorAll('.card-upload-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const recipeId = btn.getAttribute('data-id');
            openPhotoUpload(recipeId);
        });
    });
}

// ===== Photo Upload for Preset Recipes =====
let photoUploadRecipeId = null;

function openPhotoUpload(recipeId) {
    photoUploadRecipeId = recipeId;
    const recipe = allRecipes.find(r => r.id === recipeId);
    if (!recipe) return;

    uploadedImages = recipePhotos[recipeId] ? [...recipePhotos[recipeId]] : [];
    createModalTitle.textContent = `作例写真 - ${recipe.title}`;
    deleteRecipeBtn.style.display = 'none';

    // Hide all form fields except image upload
    document.querySelectorAll('.create-form-grid .form-section, .create-form-grid .form-row').forEach(el => {
        if (!el.querySelector('#imageUploadArea') && el.id !== 'imageUploadSection') {
            el.classList.add('photo-upload-hidden');
        }
    });

    renderUploadPreviews();
    createModal.classList.add('open');
    createModal.classList.add('photo-upload-mode');
    document.body.style.overflow = 'hidden';
}

function closePhotoUpload() {
    photoUploadRecipeId = null;
    createModal.classList.remove('photo-upload-mode');
    document.querySelectorAll('.photo-upload-hidden').forEach(el => {
        el.classList.remove('photo-upload-hidden');
    });
}

async function savePhotoUpload() {
    if (!photoUploadRecipeId) return;
    if (uploadedImages.length > 0) {
        await photoPut(photoUploadRecipeId, uploadedImages);
    } else {
        await photoDelete(photoUploadRecipeId);
    }
    await loadRecipePhotos();
    closePhotoUpload();
    closeCreateModal();
    renderRecipes();
}

// Open Detail Modal
function openModal(recipe) {
    const isMyRecipe = recipe.isMyRecipe;
    const userPhotos = recipePhotos[recipe.id];

    if (isMyRecipe && recipe.images && recipe.images.length > 0) {
        modalImage.src = recipe.images[0];
        modalImage.style.display = 'block';
        imageFallback.style.display = 'none';
    } else if (userPhotos && userPhotos.length > 0) {
        modalImage.src = userPhotos[0];
        modalImage.style.display = 'block';
        imageFallback.style.display = 'none';
    } else if (recipe.imageUrl) {
        modalImage.src = recipe.imageUrl;
        modalImage.style.display = 'block';
        imageFallback.style.display = 'none';
    } else {
        modalImage.src = '';
        modalImage.style.display = 'none';
        imageFallback.style.display = 'flex';
    }

    modalTitle.textContent = recipe.title;
    modalGenTag.textContent = isMyRecipe ? 'MY RECIPE' : recipe.generation;
    modalSimTag.textContent = recipe.settings.film_simulation || 'Unknown Sim';

    const modalDescNote = document.getElementById('modalDescNote');
    if (isMyRecipe) {
        modalDescNote.style.display = 'none';
    } else {
        modalDescNote.style.display = '';
    }

    // Clean up previous dynamic elements
    const existingGallery = document.querySelector('.modal-gallery');
    if (existingGallery) existingGallery.remove();
    const existingNotes = document.querySelector('.modal-notes');
    if (existingNotes) existingNotes.remove();
    const existingUploadBtn = document.querySelector('.modal-upload-btn');
    if (existingUploadBtn) existingUploadBtn.remove();

    // Gallery for multiple images (my recipe or user-uploaded photos)
    const photos = isMyRecipe ? (recipe.images || []) : (userPhotos || []);
    if (photos.length > 1) {
        const gallery = document.createElement('div');
        gallery.className = 'modal-gallery';
        photos.forEach(imgSrc => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = 'Sample photo';
            img.addEventListener('click', () => {
                modalImage.src = imgSrc;
                modalImage.style.display = 'block';
                imageFallback.style.display = 'none';
            });
            gallery.appendChild(img);
        });
        document.querySelector('.modal-meta').appendChild(gallery);
    }

    if (isMyRecipe && recipe.notes) {
        const notesDiv = document.createElement('div');
        notesDiv.className = 'modal-notes';
        notesDiv.textContent = recipe.notes;
        document.querySelector('.modal-meta').appendChild(notesDiv);
    }

    // Add upload button for preset recipes in modal
    if (!isMyRecipe) {
        const uploadBtnEl = document.createElement('button');
        uploadBtnEl.className = 'modal-upload-btn';
        uploadBtnEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>${photos.length > 0 ? '作例写真を編集' : '作例写真をアップロード'}</span>
        `;
        uploadBtnEl.addEventListener('click', () => {
            closeModal();
            openPhotoUpload(recipe.id);
        });
        document.querySelector('.modal-meta').appendChild(uploadBtnEl);
    }

    // Render camera menu
    cameraMenu.innerHTML = '';
    const orderedKeys = [
        'film_simulation', 'dynamic_range', 'grain_effect', 'grain_size',
        'color_chrome_effect', 'color_chrome_fx_blue', 'white_balance',
        'highlight_tone', 'shadow_tone', 'color', 'sharpness',
        'noise_reduction', 'clarity', 'exposure_compensation'
    ];

    let highlightedSet = false;
    orderedKeys.forEach(key => {
        if (recipe.settings[key] !== undefined && recipe.settings[key] !== '') {
            const label = settingLabels[key] || key.toUpperCase();
            const value = recipe.settings[key];
            const row = document.createElement('div');
            row.className = 'menu-row';
            if (!highlightedSet) {
                row.classList.add('highlighted');
                highlightedSet = true;
            }
            row.innerHTML = `
                <span class="setting-key">${label}</span>
                <span class="setting-val">${value}</span>
            `;
            cameraMenu.appendChild(row);
        }
    });

    recipeModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

// Close Detail Modal
function closeModal() {
    recipeModal.classList.remove('open');
    document.body.style.overflow = '';
}

// ===== Create/Edit Modal =====
function openCreateModal(existingRecipe = null) {
    editingRecipeId = existingRecipe ? existingRecipe.id : null;
    uploadedImages = existingRecipe && existingRecipe.images ? [...existingRecipe.images] : [];

    createModalTitle.textContent = existingRecipe ? 'マイレシピ編集' : 'マイレシピ作成';
    deleteRecipeBtn.style.display = existingRecipe ? '' : 'none';

    document.getElementById('myRecipeTitle').value = existingRecipe ? existingRecipe.title : '';
    document.getElementById('myFilmSim').value = existingRecipe ? (existingRecipe.settings.film_simulation || '') : '';
    document.getElementById('myDR').value = existingRecipe ? (existingRecipe.settings.dynamic_range || '') : '';
    document.getElementById('myGrain').value = existingRecipe ? (existingRecipe.settings.grain_effect || '') : '';
    document.getElementById('myCCE').value = existingRecipe ? (existingRecipe.settings.color_chrome_effect || '') : '';
    document.getElementById('myCCB').value = existingRecipe ? (existingRecipe.settings.color_chrome_fx_blue || '') : '';
    document.getElementById('myWB').value = existingRecipe ? (existingRecipe.settings.white_balance || '') : '';
    document.getElementById('myHighlight').value = existingRecipe ? (existingRecipe.settings.highlight_tone || '') : '';
    document.getElementById('myShadow').value = existingRecipe ? (existingRecipe.settings.shadow_tone || '') : '';
    document.getElementById('myColor').value = existingRecipe ? (existingRecipe.settings.color || '') : '';
    document.getElementById('mySharpness').value = existingRecipe ? (existingRecipe.settings.sharpness || '') : '';
    document.getElementById('myNR').value = existingRecipe ? (existingRecipe.settings.noise_reduction || '') : '';
    document.getElementById('myClarity').value = existingRecipe ? (existingRecipe.settings.clarity || '') : '';
    document.getElementById('myExposure').value = existingRecipe ? (existingRecipe.settings.exposure_compensation || '') : '';
    document.getElementById('myNotes').value = existingRecipe ? (existingRecipe.notes || '') : '';

    renderUploadPreviews();
    createModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCreateModal() {
    closePhotoUpload();
    createModal.classList.remove('open');
    document.body.style.overflow = '';
    editingRecipeId = null;
    uploadedImages = [];
}

function renderUploadPreviews() {
    uploadPreviewList.innerHTML = '';
    if (uploadedImages.length === 0) {
        uploadPlaceholder.style.display = '';
        return;
    }
    uploadPlaceholder.style.display = 'none';
    uploadedImages.forEach((src, i) => {
        const item = document.createElement('div');
        item.className = 'upload-preview-item';
        item.innerHTML = `
            <img src="${src}" alt="Preview">
            <button class="upload-preview-remove" data-idx="${i}">&times;</button>
        `;
        uploadPreviewList.appendChild(item);
    });

    uploadPreviewList.querySelectorAll('.upload-preview-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute('data-idx'));
            uploadedImages.splice(idx, 1);
            renderUploadPreviews();
        });
    });
}

async function handleImageFiles(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if (uploadedImages.length >= 5) break;
        const dataUrl = await readFileAsDataURL(file);
        const compressed = await compressImage(dataUrl);
        uploadedImages.push(compressed);
    }
    renderUploadPreviews();
}

async function saveMyRecipe() {
    // If in photo upload mode for a preset recipe
    if (photoUploadRecipeId) {
        await savePhotoUpload();
        return;
    }

    const title = document.getElementById('myRecipeTitle').value.trim();
    if (!title) {
        alert('レシピ名を入力してください');
        return;
    }

    const recipe = {
        id: editingRecipeId || `my-${Date.now()}`,
        title: title,
        settings: {
            film_simulation: document.getElementById('myFilmSim').value,
            dynamic_range: document.getElementById('myDR').value,
            grain_effect: document.getElementById('myGrain').value,
            color_chrome_effect: document.getElementById('myCCE').value,
            color_chrome_fx_blue: document.getElementById('myCCB').value,
            white_balance: document.getElementById('myWB').value,
            highlight_tone: document.getElementById('myHighlight').value,
            shadow_tone: document.getElementById('myShadow').value,
            color: document.getElementById('myColor').value,
            sharpness: document.getElementById('mySharpness').value,
            noise_reduction: document.getElementById('myNR').value,
            clarity: document.getElementById('myClarity').value,
            exposure_compensation: document.getElementById('myExposure').value,
        },
        images: uploadedImages,
        notes: document.getElementById('myNotes').value.trim(),
        createdAt: editingRecipeId
            ? (myRecipes.find(r => r.id === editingRecipeId)?.createdAt || Date.now())
            : Date.now(),
        updatedAt: Date.now()
    };

    await dbPut(recipe);
    await loadMyRecipes();
    closeCreateModal();
    renderRecipes();
}

async function deleteMyRecipe() {
    if (!editingRecipeId) return;
    if (!confirm('このレシピを削除しますか？')) return;
    await dbDelete(editingRecipeId);
    favorites.delete(editingRecipeId);
    saveFavorites();
    updateFavCounter();
    await loadMyRecipes();
    closeCreateModal();
    renderRecipes();
}

// Toggle Favorite Status
function toggleFavorite(id) {
    if (favorites.has(id)) {
        favorites.delete(id);
    } else {
        favorites.add(id);
    }
    saveFavorites();
    updateFavCounter();
    renderRecipes();
}

// Save Favorites to localStorage
function saveFavorites() {
    localStorage.setItem('fuji_favorites_original', JSON.stringify(Array.from(favorites)));
}

// Load Favorites from localStorage
function loadFavorites() {
    const data = localStorage.getItem('fuji_favorites_original');
    if (data) {
        try {
            favorites = new Set(JSON.parse(data));
        } catch (error) {
            console.error('Error loading favorites from localStorage:', error);
            favorites = new Set();
        }
    }
}

// Update Favorites Counter
function updateFavCounter() {
    favCountEl.textContent = favorites.size;
}

// Event Listeners setup
function setupEventListeners() {
    searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        clearSearchBtn.style.display = val ? 'flex' : 'none';
        renderRecipes();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
        renderRecipes();
    });

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-gen');
            renderRecipes();
        });
    });

    favToggleBtn.addEventListener('click', () => {
        showFavoritesOnly = !showFavoritesOnly;
        favToggleBtn.classList.toggle('active', showFavoritesOnly);
        renderRecipes();
    });

    modalClose.addEventListener('click', closeModal);
    recipeModal.addEventListener('click', (e) => {
        if (e.target === recipeModal) closeModal();
    });

    createRecipeBtn.addEventListener('click', () => openCreateModal());
    createModalClose.addEventListener('click', closeCreateModal);
    cancelCreateBtn.addEventListener('click', closeCreateModal);
    saveRecipeBtn.addEventListener('click', saveMyRecipe);
    deleteRecipeBtn.addEventListener('click', deleteMyRecipe);
    createModal.addEventListener('click', (e) => {
        if (e.target === createModal) closeCreateModal();
    });

    imageUploadArea.addEventListener('click', (e) => {
        if (e.target.closest('.upload-preview-remove')) return;
        myRecipeImageInput.click();
    });
    myRecipeImageInput.addEventListener('change', (e) => {
        handleImageFiles(e.target.files);
        myRecipeImageInput.value = '';
    });

    imageUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageUploadArea.classList.add('drag-over');
    });
    imageUploadArea.addEventListener('dragleave', () => {
        imageUploadArea.classList.remove('drag-over');
    });
    imageUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        imageUploadArea.classList.remove('drag-over');
        handleImageFiles(e.dataTransfer.files);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (createModal.classList.contains('open')) {
                closeCreateModal();
            } else if (recipeModal.classList.contains('open')) {
                closeModal();
            }
        }
    });
}

// Run app
window.addEventListener('DOMContentLoaded', init);
