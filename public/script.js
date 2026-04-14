const config = {
    numLeds: 60, // Increased for smoother blur
    radiusOffset: 0
};

let variants = {};

const ledElements = [];
let animationId = null;
let currentAnimation = null;
let startTime = null;

// Multi-step custom state
let customSequence = [];
let currentStepIndex = 0;
let stepStartTime = null;

const typeNames = { pulse: 'Pulsieren', blink: 'Blinken', spin: 'Umlaufen', fill: 'Auffüllen', switch: 'Farbe wechseln', rider: 'Knight Rider' };
let editingVariantId = null;
let editingCategory = null;
let editingStepIndex = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initLEDs();
    initTabs();
    
    // Load presets from backend
    try {
        const response = await fetch('/api/presets');
        if (response.ok) {
            variants = await response.json();
        } else {
            console.error('Failed to load presets, using empty state');
        }
    } catch (e) {
        console.error('Network error loading presets:', e);
    }

    updateCategorySelectors();
    initControls(); // depends on variants being loaded
    initCustomEditor();
});

function updateCategorySelectors() {
    const typeSelect = document.getElementById('feedback-type');
    const customList = document.getElementById('category-list');
    
    const categories = Object.keys(variants);
    const currentMainCat = typeSelect.value;
    
    typeSelect.innerHTML = '';
    customList.innerHTML = '';
    
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        typeSelect.appendChild(option);
        
        const dOpt = document.createElement('option');
        dOpt.value = cat;
        customList.appendChild(dOpt);
    });
    
    if (categories.includes(currentMainCat)) {
        typeSelect.value = currentMainCat;
    } else if (categories.length > 0) {
        typeSelect.value = categories[0];
    }
}

function initLEDs() {
    const ring = document.getElementById('led-ring');
    const ringRadius = ring.offsetWidth / 2;
    for (let i = 0; i < config.numLeds; i++) {
        const dot = document.createElement('div');
        dot.classList.add('led-dot');
        const angle = (i / config.numLeds) * 360;
        dot.style.transform = `rotate(${angle}deg) translateY(-${ringRadius}px)`;
        ring.appendChild(dot);
        ledElements.push(dot);
    }
}

function initTabs() {
    const tabPresets = document.getElementById('tab-presets');
    const tabEditor = document.getElementById('tab-editor');
    const panelPresets = document.getElementById('presets-panel');
    const panelEditor = document.getElementById('editor-panel');

    tabPresets.addEventListener('click', () => {
        tabPresets.classList.add('active');
        tabEditor.classList.remove('active');
        panelPresets.classList.remove('hidden');
        panelEditor.classList.add('hidden');
    });

    tabEditor.addEventListener('click', () => {
        tabEditor.classList.add('active');
        tabPresets.classList.remove('active');
        panelEditor.classList.remove('hidden');
        panelPresets.classList.add('hidden');
    });
}

function initControls() {
    const typeSelect = document.getElementById('feedback-type');
    const variantSelect = document.getElementById('feedback-variant');
    const triggerBtn = document.getElementById('trigger-btn');
    const stopBtn = document.getElementById('stop-btn');

    const updateVariants = () => {
        const type = typeSelect.value;
        variantSelect.innerHTML = '';
        if (variants[type]) {
            variants[type].forEach(v => {
                const option = document.createElement('option');
                option.value = v.id;
                option.textContent = v.name;
                variantSelect.appendChild(option);
            });
        }
    };

    typeSelect.addEventListener('change', updateVariants);
    updateVariants(); // initial population

    const customTypeSelect = document.getElementById('custom-type');
    const color2Group = document.getElementById('color-2-group');
    const fillAmountGroup = document.getElementById('fill-amount-group');
    
    const updateVisibility = () => {
        const val = customTypeSelect.value;
        color2Group.style.display = (val === 'switch') ? 'flex' : 'none';
        fillAmountGroup.style.display = (val === 'fill') ? 'flex' : 'none';
    };
    
    customTypeSelect.addEventListener('change', updateVisibility);
    updateVisibility(); // initial check

    // Slider value displays
    const speedIn = document.getElementById('custom-speed');
    const speedVal = document.getElementById('val-speed');
    speedIn.addEventListener('input', () => speedVal.textContent = speedIn.value);

    const brightIn = document.getElementById('custom-brightness');
    const brightVal = document.getElementById('val-brightness');
    brightIn.addEventListener('input', () => brightVal.textContent = brightIn.value);

    const fillIn = document.getElementById('custom-fill-amount');
    const fillVal = document.getElementById('val-fill');
    fillIn.addEventListener('input', () => fillVal.textContent = fillIn.value);

    const holdIn = document.getElementById('custom-hold');
    const holdVal = document.getElementById('val-hold');
    holdIn.addEventListener('input', () => holdVal.textContent = holdIn.value);

    triggerBtn.addEventListener('click', () => {
        startAnimation(variantSelect.value);
    });

    document.getElementById('edit-preset-btn').addEventListener('click', () => {
        const variantId = variantSelect.value;
        const preset = getVariantConfig(variantId);
        if (preset && preset.config) {
            editingVariantId = variantId;
            editingCategory = typeSelect.value;
            customSequence = JSON.parse(JSON.stringify(preset.config));
            renderSequence();
            document.getElementById('tab-editor').click();
            
            // Set name field for easier re-saving
            document.getElementById('custom-name').value = preset.name;
            document.getElementById('custom-category').value = typeSelect.value;
            document.getElementById('save-custom-btn').innerHTML = "💾 Änderungen speichern";
        } else {
            alert('Dieses Preset kann nicht direkt bearbeitet werden (keine Custom-Schritte gefunden).');
        }
    });

    document.getElementById('delete-preset-btn').addEventListener('click', async () => {
        const variantId = variantSelect.value;
        const cat = typeSelect.value;
        
        if (!confirm(`Möchtest du das Preset "${variantSelect.options[variantSelect.selectedIndex].text}" wirklich löschen?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/presets/${cat}/${variantId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                // Update local state and UI
                variants[cat] = variants[cat].filter(v => v.id !== variantId);
                updateVariants();
            } else {
                alert('Fehler beim Löschen des Presets.');
            }
        } catch (e) {
            console.error('Delete error:', e);
            alert('Netzwerkfehler beim Löschen.');
        }
    });

    stopBtn.addEventListener('click', stopAnimation);
}

function initCustomEditor() {
    document.getElementById('add-step-btn').addEventListener('click', () => {
        const stepDef = {
            color: hexToRgb(document.getElementById('custom-color').value),
            colorStr: document.getElementById('custom-color').value,
            color2: hexToRgb(document.getElementById('custom-color-2').value),
            colorStr2: document.getElementById('custom-color-2').value,
            type: document.getElementById('custom-type').value,
            speed: parseInt(document.getElementById('custom-speed').value, 10),
            brightness: parseInt(document.getElementById('custom-brightness').value, 10) / 100,
            reps: parseInt(document.getElementById('custom-reps').value, 10) || 1,
            fillAmount: parseInt(document.getElementById('custom-fill-amount').value, 10) || 100,
            holdTime: parseInt(document.getElementById('custom-hold').value, 10) || 0
        };
        
        if (editingStepIndex !== null) {
            // Update existing step
            customSequence[editingStepIndex] = stepDef;
            editingStepIndex = null;
            document.getElementById('add-step-btn').innerHTML = "➕ Schritt hinzufügen";
            document.getElementById('add-step-btn').classList.remove('warning-btn');
        } else {
            // Add new step
            customSequence.push(stepDef);
        }
        
        renderSequence();
    });

    document.getElementById('test-custom-btn').addEventListener('click', () => {
        if (customSequence.length === 0) return;
        startAnimation('custom');
    });
    
    document.getElementById('clear-custom-btn').addEventListener('click', () => {
        customSequence = [];
        editingVariantId = null;
        editingCategory = null;
        document.getElementById('save-custom-btn').innerHTML = "💾 Als Preset speichern";
        renderSequence();
    });

    document.getElementById('save-custom-btn').addEventListener('click', async () => {
        if (customSequence.length === 0) return;
        
        let cat = document.getElementById('custom-category').value.trim();
        if (!cat) cat = "General";
        cat = cat.toLowerCase(); // lowercase for internal keys
        
        const customNameField = document.getElementById('custom-name').value.trim();
        const variantId = editingVariantId || ('custom_' + Date.now());
        
        let saveName = customNameField;
        if (!saveName) {
            const stepsInfo = customSequence.map(s => typeNames[s.type]).join(' + ');
            saveName = `Custom: ${stepsInfo}`;
        }
        
        const newPresetVariant = {
            id: variantId,
            name: saveName,
            isCustom: true,
            config: JSON.parse(JSON.stringify(customSequence))
        };
        
        // Save to backend
        try {
            await fetch('/api/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: cat, variant: newPresetVariant })
            });

            // Update local state and UI
            if (editingCategory && editingCategory !== cat && variants[editingCategory]) {
                variants[editingCategory] = variants[editingCategory].filter(v => v.id !== variantId);
            }
            if (!variants[cat]) variants[cat] = [];
            const existingIdx = variants[cat].findIndex(v => v.id === variantId);
            if (existingIdx > -1) {
                variants[cat][existingIdx] = newPresetVariant;
            } else {
                variants[cat].push(newPresetVariant);
            }
            
            updateCategorySelectors();
            document.getElementById('custom-name').value = ''; 
            
            // Reset Edit Mode
            editingVariantId = null;
            editingCategory = null;
            document.getElementById('save-custom-btn').innerHTML = "💾 Als Preset speichern";

            document.getElementById('feedback-type').value = cat;
            document.getElementById('feedback-type').dispatchEvent(new Event('change'));
            document.getElementById('feedback-variant').value = variantId;
            document.getElementById('tab-presets').click();
        } catch (e) {
            console.error('Failed to save to backend', e);
            alert('Failed to save preset to server!');
        }
    });
}

function renderSequence() {
    const listEl = document.getElementById('sequence-list');
    if (customSequence.length === 0) {
        listEl.innerHTML = '<div class="empty-sequence">Noch keine Schritte hinzugefügt.</div>';
        return;
    }
    
    listEl.innerHTML = '';
    customSequence.forEach((step, idx) => {
        const item = document.createElement('div');
        item.classList.add('sequence-item');
        
        // Show gradient if it's a switch mode
        const colorDisplay = step.type === 'switch' 
            ? `background: linear-gradient(90deg, ${step.colorStr} 0%, ${step.colorStr2} 100%)`
            : `background-color: ${step.colorStr}`;

        const extraInfo = step.type === 'fill' ? ` | Ziel: ${step.fillAmount}%` : '';
        const holdText = step.holdTime > 0 ? ` | Hold: ${step.holdTime}ms` : '';

        item.innerHTML = `
            <div class="seq-color" style="${colorDisplay}"></div>
            <div class="seq-info">
                <strong>${idx + 1}. ${typeNames[step.type]}</strong>
                <span>${step.reps}x | Speed: ${step.speed}${extraInfo}${holdText}</span>
            </div>
            <div class="seq-actions">
                <button class="edit-step-btn" data-idx="${idx}">✎</button>
                <button class="del-step-btn" data-idx="${idx}">✕</button>
            </div>
        `;
        listEl.appendChild(item);
    });
    
    document.querySelectorAll('.edit-step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
            const step = customSequence[index];
            
            // Load values into inputs
            editingStepIndex = index;
            document.getElementById('custom-color').value = step.colorStr;
            if (step.colorStr2) document.getElementById('custom-color-2').value = step.colorStr2;
            document.getElementById('custom-type').value = step.type;
            document.getElementById('custom-speed').value = step.speed;
            document.getElementById('custom-brightness').value = step.brightness * 100;
            document.getElementById('custom-reps').value = step.reps;
            if (step.fillAmount) document.getElementById('custom-fill-amount').value = step.fillAmount;
            if (step.holdTime !== undefined) document.getElementById('custom-hold').value = step.holdTime;
            
            // Sync slider labels
            document.getElementById('val-speed').textContent = step.speed;
            document.getElementById('val-brightness').textContent = step.brightness * 100;
            document.getElementById('val-fill').textContent = step.fillAmount || 100;
            document.getElementById('val-hold').textContent = step.holdTime || 0;
            
            // UI Update
            document.getElementById('add-step-btn').innerHTML = "↻ Schritt aktualisieren";
            document.getElementById('add-step-btn').classList.add('warning-btn'); // optional styling
            
            // Trigger UI logic for color 2 visibility
            document.getElementById('custom-type').dispatchEvent(new Event('change'));
        });
    });
    
    document.querySelectorAll('.del-step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-idx'), 10);
            customSequence.splice(index, 1);
            renderSequence();
        });
    });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 59, g: 130, b: 246 };
}

function setLED(index, r, g, b, alpha = 1) {
    if (index < 0 || index >= config.numLeds) return;
    const el = ledElements[index];
    const color = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const glow = alpha > 0.1 ? `0 0 ${10 + 20*alpha}px rgba(${r}, ${g}, ${b}, ${alpha * 0.8})` : 'none';
    el.style.backgroundColor = color;
    el.style.boxShadow = glow;
}

function clearLEDs() {
    for (let i = 0; i < config.numLeds; i++) {
        setLED(i, 0, 0, 0, 0); // off
    }
}

function getVariantConfig(variantId) {
    for (let cat in variants) {
        for (let v of variants[cat]) {
            if (v.id === variantId) return v;
        }
    }
    return null;
}

function startAnimation(variantId) {
    stopAnimation();
    
    if (variantId !== 'custom') {
        const preset = getVariantConfig(variantId);
        if (preset && preset.isCustom) {
            customSequence = JSON.parse(JSON.stringify(preset.config));
            renderSequence(); // update builder view if it plays
            variantId = 'custom';
        }
    }
    
    startTime = performance.now();
    currentAnimation = variantId;
    currentStepIndex = 0;
    stepStartTime = startTime;
    loop(startTime);
}

function stopAnimation() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    currentAnimation = null;
    currentStepIndex = 0;
    clearLEDs();
}

function loop(timestamp) {
    if (currentAnimation === 'custom') {
        animCombi(timestamp);
    } else {
        clearLEDs(); // Keep original behavior for hardcoded ones
        const elapsed = timestamp - startTime;
        switch (currentAnimation) {
            case 'pulsing_blue': animPulsingBlue(elapsed); break;
            case 'spinning_green': animSpinningGreen(elapsed); break;
            case 'blinking_red': animBlinkingRed(elapsed); break;
            case 'static_orange': animStaticOrange(elapsed); break;
            case 'listen_think': animListenThink(elapsed); break;
            case 'success_confirm': animSuccessConfirm(elapsed); break;
        }
    }

    if (currentAnimation) {
        animationId = requestAnimationFrame(loop);
    }
}

// ------ Custom Combi Animation Engine ------

function animCombi(timestamp) {
    if (!customSequence || customSequence.length === 0) {
        stopAnimation();
        return;
    }
    
    if (currentStepIndex >= customSequence.length) {
        stopAnimation();
        return;
    }
    
    const stepConfig = customSequence[currentStepIndex];
    const { type, speed, reps, holdTime } = stepConfig;
    
    const baseDuration = (5000 - (speed * 48));
    const animationTotalTime = baseDuration * reps;
    const stepTotalTime = animationTotalTime + (holdTime || 0);
    const elapsedStep = timestamp - stepStartTime;
    
    if (elapsedStep >= stepTotalTime) {
        currentStepIndex++;
        stepStartTime = timestamp;
        if (currentStepIndex < customSequence.length) {
            animCombi(timestamp); 
        }
        return;
    }

    clearLEDs();

    // For cyclic effects (pulse, blink) with a hold time: cut the animation
    // at the PEAK of the last cycle (reps-0.5 cycles) instead of letting it
    // complete and go dark again. e.g. pulse at phase=0.5 = maximum brightness.
    // For directional effects (fill, switch) no adjustment needed - they end
    // at a natural "complete" state at phase=1.0.
    let switchToHoldAt;
    if ((holdTime || 0) > 0 && (type === 'pulse' || type === 'blink')) {
        switchToHoldAt = baseDuration * (reps - 0.5);
    } else {
        switchToHoldAt = animationTotalTime;
    }

    if (elapsedStep < switchToHoldAt) {
        const phase = (elapsedStep % baseDuration) / baseDuration;
        renderStepPhase(stepConfig, phase);
    } else {
        // Hold phase: render the "completed" final state
        renderStepFinalState(stepConfig);
    }
}

/**
 * Renders a step definition at its current phase (0 to 1).
 */
function renderStepPhase(stepConfig, phase) {
    const { color, type, brightness, fillAmount, colorStr2, color2 } = stepConfig;

    if (type === 'pulse') {
        const cycle = (Math.sin(phase * Math.PI * 2 - Math.PI/2) + 1) / 2; 
        const currentB = cycle * brightness;
        for (let i = 0; i < config.numLeds; i++) {
            setLED(i, color.r, color.g, color.b, currentB);
        }
    } else if (type === 'blink') {
        const isOn = phase < 0.5;
        const currentB = isOn ? brightness : 0;
        for (let i = 0; i < config.numLeds; i++) {
            setLED(i, color.r, color.g, color.b, currentB);
        }
    } else if (type === 'spin') {
        const centerLed = Math.floor(phase * config.numLeds);
        const arcSize = Math.floor(config.numLeds / 6);
        for (let i = 0; i < config.numLeds; i++) {
            let dist = Math.abs(i - centerLed);
            if (dist > config.numLeds / 2) dist = config.numLeds - dist;
            if (dist < arcSize) {
                const intensity = (1 - (dist / arcSize)) * brightness;
                setLED(i, color.r, color.g, color.b, intensity);
            }
        }
    } else if (type === 'fill') {
        const targetLeds = Math.floor((fillAmount / 100) * config.numLeds);
        const filled = Math.floor(phase * targetLeds);
        for (let i = 0; i < config.numLeds; i++) {
            if (i <= filled) {
                setLED(i, color.r, color.g, color.b, brightness);
            }
        }
    } else if (type === 'switch') {
        const r = Math.round(color.r + (color2.r - color.r) * phase);
        const g = Math.round(color.g + (color2.g - color.g) * phase);
        const b = Math.round(color.b + (color2.b - color.b) * phase);
        for (let i = 0; i < config.numLeds; i++) {
            setLED(i, r, g, b, brightness);
        }
    } else if (type === 'rider') {
        const oscillation = 1 - Math.abs(1 - (phase * 2)); 
        const halfCircle = config.numLeds / 2;
        const pos1 = Math.floor(oscillation * halfCircle);
        const pos2 = config.numLeds - pos1;
        const arcSize = Math.floor(config.numLeds / 10);
        for (let i = 0; i < config.numLeds; i++) {
            let dist1 = Math.abs(i - pos1);
            if (dist1 > config.numLeds / 2) dist1 = config.numLeds - dist1;
            let dist2 = Math.abs(i - pos2);
            if (dist2 > config.numLeds / 2) dist2 = config.numLeds - dist2;
            const minDist = Math.min(dist1, dist2);
            if (minDist < arcSize) {
                const intensity = (1 - (minDist / arcSize)) * brightness;
                setLED(i, color.r, color.g, color.b, intensity);
            }
        }
    }
}

/**
 * Renders a specific step definition at its "Final" or "Hold" state.
 */
function renderStepFinalState(step) {
    const { color, type, brightness, fillAmount, color2 } = step;
    
    if (type === 'pulse') {
        // Hold at peak brightness instead of 0
        for (let i = 0; i < config.numLeds; i++) {
            setLED(i, color.r, color.g, color.b, brightness);
        }
    } else if (type === 'blink') {
        // Hold at ON state
        for (let i = 0; i < config.numLeds; i++) {
            setLED(i, color.r, color.g, color.b, brightness);
        }
    } else if (type === 'spin') {
        // Hold at the very end of the spin (phase 1.0)
        const pos = config.numLeds - 1;
        const arcSize = Math.floor(config.numLeds / 6);
        for (let i = 0; i < config.numLeds; i++) {
            let dist = Math.abs(i - pos);
            if (dist > config.numLeds / 2) dist = config.numLeds - dist;
            if (dist < arcSize) {
                const intensity = (1 - (dist / arcSize)) * brightness;
                setLED(i, color.r, color.g, color.b, intensity);
            }
        }
    } else if (type === 'fill') {
        const targetLeds = Math.floor((fillAmount / 100) * config.numLeds);
        for (let i = 0; i < config.numLeds; i++) {
            if (i <= targetLeds) {
                setLED(i, color.r, color.g, color.b, brightness);
            }
        }
    } else if (type === 'switch') {
        // Hold at the target color (color2)
        for (let i = 0; i < config.numLeds; i++) {
            setLED(i, color2.r, color2.g, color2.b, brightness);
        }
    } else if (type === 'rider') {
        // Hold at the bounce point (bottom/top)
        const pos1 = Math.floor(config.numLeds / 2);
        const pos2 = config.numLeds - pos1;
        const arcSize = Math.floor(config.numLeds / 10);
        for (let i = 0; i < config.numLeds; i++) {
            let dist1 = Math.abs(i - pos1);
            if (dist1 > config.numLeds / 2) dist1 = config.numLeds - dist1;
            let dist2 = Math.abs(i - pos2);
            if (dist2 > config.numLeds / 2) dist2 = config.numLeds - dist2;
            const minDist = Math.min(dist1, dist2);
            if (minDist < arcSize) {
                const intensity = (1 - (minDist / arcSize)) * brightness;
                setLED(i, color.r, color.g, color.b, intensity);
            }
        }
    }
}

// ------ Hardcoded Animation Functions ------

function animPulsingBlue(elapsed) {
    const cycle = (Math.sin(elapsed / 1000 * Math.PI) + 1) / 2; 
    const brightness = 0.2 + (cycle * 0.8);
    for (let i = 0; i < config.numLeds; i++) {
        setLED(i, 59, 130, 246, brightness);
    }
}

function animSpinningGreen(elapsed) {
    const rotationProgress = (elapsed % 1000) / 1000;
    const centerLed = Math.floor(rotationProgress * config.numLeds);
    for (let i = 0; i < config.numLeds; i++) {
        let dist = Math.abs(i - centerLed);
        if (dist > config.numLeds / 2) {
            dist = config.numLeds - dist;
        }
        const arcSize = Math.floor(config.numLeds / 6);
        if (dist < arcSize) {
            const intensity = 1 - (dist / arcSize);
            setLED(i, 34, 197, 94, intensity);
        }
    }
}

function animBlinkingRed(elapsed) {
    const isOn = (elapsed % 1000) < 500;
    const brightness = isOn ? 1.0 : 0.05;
    for (let i = 0; i < config.numLeds; i++) {
        setLED(i, 239, 68, 68, brightness);
    }
}

function animStaticOrange(elapsed) {
    for (let i = 0; i < config.numLeds; i++) {
        if (i >= config.numLeds * 0.75 || i <= config.numLeds * 0.25) {
            setLED(i, 245, 158, 11, 0.8);
        }
    }
}

function animListenThink(elapsed) {
    const shimmer = (Math.sin(elapsed / 150) + 1) / 2 * 0.3;
    const frontIndex = Math.floor(config.numLeds / 2);
    const arcSize = Math.floor(config.numLeds / 5);
    for (let i = 0; i < config.numLeds; i++) {
        let dist = Math.abs(i - frontIndex);
        if (dist > config.numLeds / 2) dist = config.numLeds - dist;
        if (dist < arcSize) {
            const intensity = (1 - (dist / arcSize)) * (0.7 + shimmer);
            const r = dist < 2 ? 6 : 59;
            const g = dist < 2 ? 182 : 130;
            const b = dist < 2 ? 212 : 246;
            setLED(i, r, g, b, intensity);
        }
    }
}

function animSuccessConfirm(elapsed) {
    const duration = 1000;
    if (elapsed > duration) {
        currentAnimation = null;
        clearLEDs();
        return;
    }
    const progress = elapsed / duration;
    const spreadIndex = Math.min(config.numLeds / 2, (progress * 2) * (config.numLeds / 2));
    const fadeOut = progress > 0.5 ? 1 - ((progress - 0.5) * 2) : 1;
    for (let i = 0; i < config.numLeds; i++) {
        let dist = Math.abs(i - 0); 
        if (dist > config.numLeds / 2) dist = config.numLeds - dist;
        if (dist <= spreadIndex) {
            const brightness = Math.max(0, 1 - ((spreadIndex - dist) * 0.2)) * fadeOut;
            setLED(i, 34, 197, 94, brightness);
        }
    }
}
