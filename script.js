// Global Quiz State
let regionalSpeciesPool = [];
let regionalTaxonIds = new Set();
let quizQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
let selectedLanguage = 'he';
let currentPlaceId = '6803';
let currentObservationUrl = '';
let selectedMonths = '';

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultsScreen = document.getElementById('results-screen');
const setupForm = document.getElementById('setup-form');
const loadingSpinner = document.getElementById('loading-spinner');
const loadingStatus = document.getElementById('loading-status');
const startBtn = document.getElementById('start-btn');

// Taxon Autocomplete Elements
const taxonInput = document.getElementById('taxon-input');
const taxonIdInput = document.getElementById('taxon-id');
const taxonResults = document.getElementById('taxon-results');

// Location Autocomplete Elements
const placeInput = document.getElementById('place-input');
const placeIdInput = document.getElementById('place-id');
const placeResults = document.getElementById('place-results');

// Quiz Display Elements
const quizImage = document.getElementById('quiz-image');
const imageLoader = document.getElementById('image-loader');
const photographerName = document.getElementById('photographer-name');
const inatLink = document.getElementById('inat-link');
const optionsContainer = document.getElementById('options-container');
const nextContainer = document.getElementById('next-container');
const nextBtn = document.getElementById('next-btn');

const qCurrent = document.getElementById('q-current');
const scoreCount = document.getElementById('score-count');
const progressBar = document.getElementById('progress-bar');

// Helper for safe fetching with JSON check
async function safeFetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`שגיאה בתקשורת מול השרת (${res.status})`);
    }
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        throw new Error("השרת החזיר תשובה שאינה JSON");
    }
    return await res.json();
}

// ==========================================
// 1. TAXON AUTOCOMPLETE (iNaturalist API)
// ==========================================
let taxonTimeout = null;
taxonInput.addEventListener('input', (e) => {
    clearTimeout(taxonTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
        taxonResults.classList.add('hidden');
        return;
    }
    taxonTimeout = setTimeout(async () => {
        try {
            const data = await safeFetchJson(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query)}`);
            renderTaxonAutocomplete(data.results || []);
        } catch (err) {
            console.error('Taxon autocomplete error:', err);
        }
    }, 300);
});

function renderTaxonAutocomplete(results) {
    taxonResults.innerHTML = '';
    if (results.length === 0) {
        taxonResults.classList.add('hidden');
        return;
    }
    results.slice(0, 6).forEach(taxon => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';

        const imgUrl = taxon.default_photo ? taxon.default_photo.square_url : 'https://www.inaturalist.org/assets/taxon-icon-unk.png';
        const commonName = taxon.preferred_common_name || taxon.name;
        const sciName = taxon.name;
        const rank = taxon.rank ? `(${taxon.rank})` : '';

        item.innerHTML = `
            <img src="${imgUrl}" class="autocomplete-thumb" alt="${commonName}">
            <div class="autocomplete-info">
                <div class="autocomplete-title">${commonName}</div>
                <div class="autocomplete-sub">${sciName} ${rank}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            taxonInput.value = `${commonName} (${sciName})`;
            taxonIdInput.value = taxon.id;
            taxonResults.classList.add('hidden');
        });
        taxonResults.appendChild(item);
    });
    taxonResults.classList.remove('hidden');
}


// ==========================================
// 2. LOCATION AUTOCOMPLETE (iNaturalist API)
// ==========================================
let placeTimeout = null;
placeInput.addEventListener('input', (e) => {
    clearTimeout(placeTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
        placeResults.classList.add('hidden');
        return;
    }
    placeTimeout = setTimeout(async () => {
        try {
            const data = await safeFetchJson(`https://api.inaturalist.org/v1/places/autocomplete?q=${encodeURIComponent(query)}`);
            renderPlaceAutocomplete(data.results || []);
        } catch (err) {
            console.error('Place autocomplete error:', err);
        }
    }, 300);
});

function renderPlaceAutocomplete(results) {
    placeResults.innerHTML = '';
    if (results.length === 0) {
        placeResults.classList.add('hidden');
        return;
    }
    results.slice(0, 6).forEach(place => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';

        const displayName = place.display_name || place.name;
        const placeType = place.place_type_name ? `(${place.place_type_name})` : '';

        item.innerHTML = `
            <div class="autocomplete-info">
                <div class="autocomplete-title">${displayName}</div>
                <div class="autocomplete-sub">ID: ${place.id} ${placeType}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            placeInput.value = displayName;
            placeIdInput.value = place.id;
            placeResults.classList.add('hidden');
        });
        placeResults.appendChild(item);
    });
    placeResults.classList.remove('hidden');
}

// Close Autocomplete Dropdowns on outside click
document.addEventListener('click', (e) => {
    if (!taxonInput.contains(e.target) && !taxonResults.contains(e.target)) {
        taxonResults.classList.add('hidden');
    }
    if (!placeInput.contains(e.target) && !placeResults.contains(e.target)) {
        placeResults.classList.add('hidden');
    }
});


// ==========================================
// 3. QUIZ GENERATION ENGINE
// ==========================================
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const taxonId = taxonIdInput.value || '';
    currentPlaceId = placeIdInput.value || '';
    selectedLanguage = document.getElementById('lang-select').value;
    selectedMonths = Array.from(document.querySelectorAll('input[name="month"]:checked'))
        .map(cb => cb.value)
        .join(',');

    startBtn.disabled = true;
    loadingSpinner.classList.remove('hidden');

    try {
        updateLoading('מוריד מגוון מינים מקומי מ-iNaturalist...');
        await fetchRegionalSpecies(taxonId, currentPlaceId);

        if (regionalSpeciesPool.length < 5) {
            alert('נמצאו מעט מדי מינים באזור שנבחר. אנא בחר מיקום רחב יותר או טקסון עשיר יותר.');
            resetSetupUI();
            return;
        }

        updateLoading('מוצא מסיחים ומינים דומים מהאזור...');
        await buildQuizQuestions(20, currentPlaceId);

        startQuiz();
    } catch (err) {
        console.error(err);
        alert(`שגיאה בטעינת הנתונים: ${err.message}`);
    } finally {
        resetSetupUI();
    }
});

function updateLoading(msg) {
    loadingStatus.textContent = msg;
}

function resetSetupUI() {
    startBtn.disabled = false;
    loadingSpinner.classList.add('hidden');
}

// Pre-fetch all species present in target region
async function fetchRegionalSpecies(taxonId, placeId) {
    let url = `https://api.inaturalist.org/v1/observations/species_counts?taxon_id=${taxonId}&place_id=${placeId}&per_page=200&quality_grade=research`;
    
    if (selectedMonths) {
        url += `&month=${selectedMonths}`;
    }
    const data = await safeFetchJson(url);

    regionalSpeciesPool = (data.results || [])
        .map(r => r.taxon)
        .filter(t => t && t.default_photo);

    regionalTaxonIds = new Set(regionalSpeciesPool.map(t => t.id));
}

// Fetch similar species for a single taxon that exist in the target region
async function fetchSimilarRegionalSpecies(taxonId, placeId) {
    try {
        const url = `https://api.inaturalist.org/v1/identifications/similar_species?taxon_id=${taxonId}&place_id=${placeId}`;
        const data = await safeFetchJson(url);
        const similarTaxa = (data.results || []).map(r => r.taxon);
        
        return similarTaxa.filter(t => t && t.id !== taxonId && regionalTaxonIds.has(t.id));
    } catch (e) {
        return [];
    }
}

// Fallback: Find closest taxonomic relatives (Same Genus / Family) from regional pool
function getTaxonomicDistractors(target, count, excludeSet) {
    const targetAncestors = new Set(target.ancestor_ids || []);

    const candidates = regionalSpeciesPool
        .filter(t => t.id !== target.id && !excludeSet.has(t.id))
        .map(t => {
            const sharedAncestors = (t.ancestor_ids || []).filter(id => targetAncestors.has(id)).length;
            return { taxon: t, score: sharedAncestors };
        });

    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return 0.5 - Math.random();
    });

    return candidates.slice(0, count).map(c => c.taxon);
}

// Build 20 Quiz Questions with similar regional distractors
async function buildQuizQuestions(count, placeId) {
    quizQuestions = [];
    const shuffledPool = [...regionalSpeciesPool].sort(() => 0.5 - Math.random());
    const targetList = shuffledPool.slice(0, count);

    // Fetch similar species for all targets IN PARALLEL
    const similarPromises = targetList.map(target => fetchSimilarRegionalSpecies(target.id, placeId));
    const similarResults = await Promise.all(similarPromises);

    for (let i = 0; i < targetList.length; i++) {
        const target = targetList[i];
        let distractors = similarResults[i] || [];

        const excludeSet = new Set([target.id, ...distractors.map(d => d.id)]);

        if (distractors.length < 3) {
            const needed = 3 - distractors.length;
            const fallbackDistractors = getTaxonomicDistractors(target, needed, excludeSet);
            distractors = [...distractors, ...fallbackDistractors];
        } else {
            distractors = distractors.slice(0, 3);
        }

        quizQuestions.push({
            target: target,
            distractors: distractors
        });
    }
}


// ==========================================
// 4. RANDOM OBSERVATION PHOTO FETCHING
// ==========================================
async function getRandomObservationPhoto(taxonId, placeId) {
    try {
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const url = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&place_id=${placeId}&photos=true&quality_grade=research&per_page=10&page=${randomPage}`;
        const data = await safeFetchJson(url);
        
        let obsList = data.results || [];
        
        if (obsList.length === 0 && randomPage > 1) {
            const fallbackUrl = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&place_id=${placeId}&photos=true&quality_grade=research&per_page=10&page=1`;
            const fallbackData = await safeFetchJson(fallbackUrl);
            obsList = fallbackData.results || [];
        }

        if (obsList.length > 0) {
            const randomObs = obsList[Math.floor(Math.random() * obsList.length)];
            if (randomObs.photos && randomObs.photos.length > 0) {
                const randomPhoto = randomObs.photos[Math.floor(Math.random() * randomObs.photos.length)];
                const mediumUrl = randomPhoto.url ? randomPhoto.url.replace('square', 'medium') : null;
                
                return {
                    photoUrl: mediumUrl,
                    attribution: randomObs.user ? (randomObs.user.name || randomObs.user.login) : 'iNaturalist User',
                    obsUrl: `https://www.inaturalist.org/observations/${randomObs.id}`
                };
            }
        }
    } catch (e) {
        console.warn('Could not fetch random observation photo, falling back to default:', e);
    }
    return null;
}


// ==========================================
// 5. QUIZ DISPLAY & INTERACTION
// ==========================================
function startQuiz() {
    currentQuestionIndex = 0;
    score = 0;
    scoreCount.textContent = '0';
    setupScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    resultsScreen.classList.add('hidden');
    displayQuestion();
}

async function displayQuestion() {
    nextContainer.classList.add('hidden');
    optionsContainer.innerHTML = '';
    imageLoader.classList.remove('hidden');

    // Reset image clickability until answer is given
    quizImage.style.cursor = 'default';
    quizImage.onclick = null;
    quizImage.title = '';

    const currentQ = quizQuestions[currentQuestionIndex];
    const target = currentQ.target;

    // Progress Bar
    qCurrent.textContent = currentQuestionIndex + 1;
    const progressPct = ((currentQuestionIndex + 1) / quizQuestions.length) * 100;
    progressBar.style.width = `${progressPct}%`;

    // Fetch random observation photo
    const obsData = await getRandomObservationPhoto(target.id, currentPlaceId);

    let photoUrl, photographer, obsUrl;
    if (obsData && obsData.photoUrl) {
        photoUrl = obsData.photoUrl;
        photographer = obsData.attribution;
        obsUrl = obsData.obsUrl;
    } else {
        const defaultPhoto = target.default_photo;
        photoUrl = defaultPhoto ? (defaultPhoto.medium_url || defaultPhoto.square_url) : '';
        photographer = defaultPhoto ? defaultPhoto.attribution : 'iNaturalist User';
        obsUrl = `https://www.inaturalist.org/taxa/${target.id}`;
    }

    currentObservationUrl = obsUrl;

    quizImage.src = photoUrl;
    quizImage.onload = () => imageLoader.classList.add('hidden');
    photographerName.textContent = photographer || 'iNaturalist User';
    inatLink.href = obsUrl;

    // Options (1 Correct + 3 Distractors)
    const allOptions = [target, ...currentQ.distractors].sort(() => 0.5 - Math.random());
    const optionIds = allOptions.map(o => o.id);

    const localizedNames = await fetchLocalizedNames(optionIds, selectedLanguage);

    allOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.dataset.taxonId = opt.id;

        const commonName = localizedNames[opt.id] || opt.preferred_common_name || opt.name;
        const scientificName = opt.name;

        btn.innerHTML = `
            <span class="option-title">${commonName}</span>
            <span class="option-sub">${scientificName}</span>
        `;

        btn.addEventListener('click', () => handleAnswer(opt.id, target.id, btn));
        optionsContainer.appendChild(btn);
    });
}

async function fetchLocalizedNames(ids, locale) {
    if (!ids || ids.length === 0) return {};
    try {
        const data = await safeFetchJson(`https://api.inaturalist.org/v1/taxa/${ids.join(',')}?locale=${locale}`);
        const map = {};
        (data.results || []).forEach(t => {
            map[t.id] = t.preferred_common_name || t.name;
        });
        return map;
    } catch (e) {
        return {};
    }
}

function handleAnswer(selectedId, correctId, clickedBtn) {
    const allBtns = optionsContainer.querySelectorAll('.option-btn');
    
    allBtns.forEach(btn => {
        btn.disabled = true;
        // Highlight the correct answer in green
        if (parseInt(btn.dataset.taxonId) === correctId) {
            btn.classList.add('correct');
        }
    });

    if (selectedId === correctId) {
        score++;
        scoreCount.textContent = score;
    } else {
        // Highlight chosen wrong answer in red
        clickedBtn.classList.add('wrong');
    }

    // Enable image click to open observation
    quizImage.style.cursor = 'pointer';
    quizImage.title = 'לחץ לצפייה בתצפית המלאה ב-iNaturalist';
    quizImage.onclick = () => {
        if (currentObservationUrl) {
            window.open(currentObservationUrl, '_blank');
        }
    };

    nextContainer.classList.remove('hidden');
}

nextBtn.addEventListener('click', () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < quizQuestions.length) {
        displayQuestion();
    } else {
        showResults();
    }
});

function showResults() {
    quizScreen.classList.add('hidden');
    resultsScreen.classList.remove('hidden');

    document.getElementById('final-score').textContent = score;
    const pct = (score / quizQuestions.length) * 100;
    const feedbackEl = document.getElementById('performance-feedback');

    if (pct >= 90) {
        feedbackEl.textContent = 'יא טרקטור מירוץ מכונת המכונות';
    } else if (pct >= 70) {
        feedbackEl.textContent = 'יפה יפה';
    } else if (pct >= 50) {
        feedbackEl.textContent = 'יש עם מה לעבוד';
    } else {
        feedbackEl.textContent = 'meh, תעשה עוד אחד';
    }
}

document.getElementById('restart-same-btn').addEventListener('click', async () => {
    resultsScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    startBtn.disabled = true;
    loadingSpinner.classList.remove('hidden');

    updateLoading('מכין חידון חדש...');
    await buildQuizQuestions(20, currentPlaceId);
    resetSetupUI();
    startQuiz();
});

document.getElementById('change-settings-btn').addEventListener('click', () => {
    resultsScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
});
document.getElementById('change-settings-btn').addEventListener('click', () => {
    resultsScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
});
