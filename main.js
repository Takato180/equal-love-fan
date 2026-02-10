import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==================== SCENE SETUP ====================
const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x050505, 1);
renderer.sortObjects = true; // 透明オブジェクトの正しいソートを保証
renderer.outputColorSpace = THREE.SRGBColorSpace; // GLBテクスチャの色空間を正しく表示
camera.position.set(0, 0, 5);

// ==================== ステージ照明 ====================
// GLBモデルを最低限照らす環境光（元の暗い世界観を保持）
const ambientLight = new THREE.AmbientLight(0x221133, 0.4);
scene.add(ambientLight);
// 上下のグラデーション（控えめ）
const hemiLight = new THREE.HemisphereLight(0x443366, 0x050505, 0.3);
scene.add(hemiLight);
// GLB照明器具から出るスポットライト（後でGLBロード時にアタッチ）
const glbSpotLights = [];  // GLB照明器具からのSpotLight配列
// ステージ中央のベースライト（控えめに）
const stageCenterSpot = new THREE.PointLight(0xff88cc, 0.6, 30);
stageCenterSpot.position.set(0, 2, -7);
scene.add(stageCenterSpot);
// ステージ左右のアクセントライト（控えめに）
const stageLeftSpot = new THREE.PointLight(0x6644ff, 0.3, 20);
stageLeftSpot.position.set(-8, 4, -8);
scene.add(stageLeftSpot);
const stageRightSpot = new THREE.PointLight(0xff4488, 0.3, 20);
stageRightSpot.position.set(8, 4, -8);
scene.add(stageRightSpot);

// ==================== ステージ動画オーバーレイ ====================
const stageVideoContainer = document.createElement('div');
stageVideoContainer.id = 'stage-video-container';
stageVideoContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:4;pointer-events:none;overflow:hidden;display:none;';
document.body.appendChild(stageVideoContainer);
let stageVideoIframe = null;
let stageVideoActive = false;
let stageVideoShowingIframe = true;

// ==================== 自動再生（連続再生）====================
let autoPlayEnabled = true;
let shuffleEnabled = false;
let autoPlayTimer = null;
let ytPlayer = null;
let ytApiReady = false;

function playNextSong() {
    if (!autoPlayEnabled || !currentSongId) return;
    const allSongs = [...mvList, ...extraMvList];
    if (shuffleEnabled) {
        // シャッフル: 現在の曲以外からランダムに選択
        const candidates = allSongs.filter(mv => mv.id !== currentSongId);
        const next = candidates[Math.floor(Math.random() * candidates.length)];
        if (next) playMV(next.id, next.title);
    } else {
        // 通常: mvListのみで順番再生
        const currentIdx = mvList.findIndex(mv => mv.id === currentSongId);
        const nextIdx = (currentIdx + 1) % mvList.length;
        const next = mvList[nextIdx];
        if (next) playMV(next.id, next.title);
    }
}

// YouTube IFrame API をロード
if (!window.YT) {
    const ytScript = document.createElement('script');
    ytScript.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(ytScript);
}
window.onYouTubeIframeAPIReady = () => { ytApiReady = true; };

// ==================== 探索モード（OrbitControls）====================
let exploreMode = false;
const orbitControls = new OrbitControls(camera, canvas);
orbitControls.enabled = false;
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.rotateSpeed = 0.5;
orbitControls.zoomSpeed = 0.8;
orbitControls.minDistance = 2;
orbitControls.maxDistance = 35;
orbitControls.maxPolarAngle = Math.PI * 0.85;
orbitControls.target.set(0, -1, -8);

// 探索モード切替ボタン
const exploreBtn = document.createElement('button');
exploreBtn.id = 'explore-btn';
exploreBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><path d="M8 5v14l11-7z"/></svg> ステージ探索';
exploreBtn.title = 'ステージを自由に見回す';
document.body.appendChild(exploreBtn);

// 探索モード用ヘルプ
const exploreHelp = document.createElement('div');
exploreHelp.id = 'explore-help';
exploreHelp.innerHTML = `
    <div class="explore-help-header" id="explore-drag-handle">
        <span class="explore-help-title">ステージ探索モード</span>
        <button class="explore-collapse-btn" id="explore-collapse-btn" title="折りたたみ">▼</button>
    </div>
    <div class="explore-help-body" id="explore-help-body">
        <div class="explore-help-controls">
            <span>ドラッグ: 回転</span>
            <span>スクロール: ズーム</span>
            <span>右ドラッグ: 移動</span>
        </div>
        <div class="explore-presets">
            <button class="explore-preset" data-view="front">正面</button>
            <button class="explore-preset" data-view="screen">スクリーン前</button>
            <button class="explore-preset" data-view="stage">ステージ全体</button>
            <button class="explore-preset" data-view="audience">ステージ上</button>
            <button class="explore-preset" data-view="ceiling">天井演出</button>
            <button class="explore-preset" data-view="aerial">俯瞰</button>
            <button class="explore-preset" data-view="side">サイド</button>
            <button class="explore-preset" data-view="backstage">舞台裏</button>
        </div>
        <div class="explore-song-selector">
            <div class="explore-song-label">曲を選択</div>
            <div class="explore-song-list" id="explore-song-list"></div>
        </div>
        <button id="explore-close" class="explore-close-btn"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> 通常モードに戻る</button>
    </div>
`;

// 折りたたみ機能
let exploreCollapsed = false;
exploreHelp.addEventListener('click', (e) => {
    if (e.target.id === 'explore-collapse-btn' || e.target.closest('#explore-drag-handle') && !e.target.closest('.explore-collapse-btn')) {
        // ヘッダークリックでも折りたたみ
    }
});
setTimeout(() => {
    const collapseBtn = document.getElementById('explore-collapse-btn');
    const helpBody = document.getElementById('explore-help-body');
    const dragHandle = document.getElementById('explore-drag-handle');
    if (collapseBtn && helpBody) {
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exploreCollapsed = !exploreCollapsed;
            helpBody.style.display = exploreCollapsed ? 'none' : 'block';
            collapseBtn.innerHTML = exploreCollapsed ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' : '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>';
            collapseBtn.title = exploreCollapsed ? '展開' : '折りたたみ';
        });
    }
    // ドラッグ移動機能
    if (dragHandle) {
        let isDragging = false;
        let dragStartX, dragStartY, panelStartX, panelStartY;
        dragHandle.addEventListener('mousedown', (e) => {
            if (e.target.closest('.explore-collapse-btn')) return;
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const rect = exploreHelp.getBoundingClientRect();
            panelStartX = rect.left;
            panelStartY = rect.top;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            exploreHelp.style.right = 'auto';
            exploreHelp.style.bottom = 'auto';
            exploreHelp.style.left = (panelStartX + dx) + 'px';
            exploreHelp.style.top = (panelStartY + dy) + 'px';
        });
        window.addEventListener('mouseup', () => { isDragging = false; });
    }
}, 100);
document.body.appendChild(exploreHelp);

// カメラプリセット
const cameraPresets = {
    front:    { pos: [0, -3, 2],      target: [0, -4, -8] },     // 最前列からステージを見上げる
    screen:   { pos: [0, -2, -5],     target: [0, -3, -10] },    // スクリーン間近
    stage:    { pos: [3, -2.5, -9],   target: [-2, -4, 3] },     // ステージ上・アイドル視点で客席を見る
    audience: { pos: [0, 0, 10],      target: [0, -3, -8] },     // 観客席中段からステージ全体を見渡す
    ceiling:  { pos: [0, -4.5, -4],   target: [0, 3, -9] },      // 下から天井スクリーンを見上げる
    aerial:   { pos: [8, 8, 6],       target: [0, -4, -8] },     // 斜め前方からの俯瞰（全体が見える）
    side:     { pos: [14, -1, -4],    target: [0, -4, -8] },     // サイドアリーナ
    backstage:{ pos: [5, -1, -18],    target: [0, -4, -5] },     // 舞台裏から斜め上・裏方スタッフ視点
};

function animateCameraTo(preset, duration = 1200) {
    const startPos = camera.position.clone();
    const startTarget = orbitControls.target.clone();
    const endPos = new THREE.Vector3(...preset.pos);
    const endTarget = new THREE.Vector3(...preset.target);
    const startTime = performance.now();

    function update() {
        const t = Math.min(1, (performance.now() - startTime) / duration);
        const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
        camera.position.lerpVectors(startPos, endPos, ease);
        orbitControls.target.lerpVectors(startTarget, endTarget, ease);
        orbitControls.update();
        if (t < 1) requestAnimationFrame(update);
    }
    update();
}

function toggleExploreMode() {
    console.log('[EXPLORE] toggleExploreMode called, current:', exploreMode, '→', !exploreMode);
    exploreMode = !exploreMode;
    orbitControls.enabled = exploreMode;
    exploreBtn.classList.toggle('active', exploreMode);
    exploreHelp.classList.toggle('active', exploreMode);
    document.body.classList.toggle('explore-active', exploreMode);

    if (exploreMode) {
        // スクロールを無効化してステージ操作に専念
        document.body.style.overflow = 'hidden';
        // ステージに近づく
        animateCameraTo(cameraPresets.front);
    } else {
        document.body.style.overflow = '';
        // 元のカメラ位置に戻す
        animateCameraTo({ pos: [0, 0, 5], target: [0, 0, 0] });
    }
}

exploreBtn.addEventListener('click', (e) => {
    console.log('[EXPLORE] Button clicked!', e.target, e.currentTarget);
    toggleExploreMode();
});
document.getElementById('explore-close')?.addEventListener('click', (e) => {
    console.log('[EXPLORE] Close button clicked!');
    e.stopPropagation();
    toggleExploreMode();
});

// プリセットボタン
document.querySelectorAll('.explore-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (cameraPresets[view]) animateCameraTo(cameraPresets[view]);
    });
});

// ==================== =LOVE PENLIGHT COLORS ====================
const penlightColors = [
    new THREE.Color('#FFFFFF'),   // 大谷映美里 - 白
    new THREE.Color('#FFA500'),   // 大場花菜 - オレンジ
    new THREE.Color('#87CEEB'),   // 音嶋莉沙 - 水色
    new THREE.Color('#FFB6C1'),   // 齋藤樹愛羅 - 薄ピンク
    new THREE.Color('#FFFFFF'),   // 佐々木舞香 - 白
    new THREE.Color('#FF0000'),   // 髙松瞳 - 赤
    new THREE.Color('#FFD700'),   // 瀧脇笙古 - 黄
    new THREE.Color('#800080'),   // 野口衣織 - 紫
    new THREE.Color('#008000'),   // 諸橋沙夏 - 緑
    new THREE.Color('#0000FF'),   // 山本杏奈 - 青
    new THREE.Color('#FF1493'),   // =LOVE ピンク
    new THREE.Color('#FF1493'),   // =LOVE ディープピンク
];

// ==================== HEART SHAPE ====================
function createHeartShape(scale = 1) {
    const shape = new THREE.Shape();
    const s = scale;
    shape.moveTo(0, 0.3 * s);
    shape.bezierCurveTo(0, 0.45 * s, -0.15 * s, 0.6 * s, -0.35 * s, 0.6 * s);
    shape.bezierCurveTo(-0.7 * s, 0.6 * s, -0.7 * s, 0.225 * s, -0.7 * s, 0.225 * s);
    shape.bezierCurveTo(-0.7 * s, 0, -0.35 * s, -0.225 * s, 0, -0.45 * s);
    shape.bezierCurveTo(0.35 * s, -0.225 * s, 0.7 * s, 0, 0.7 * s, 0.225 * s);
    shape.bezierCurveTo(0.7 * s, 0.225 * s, 0.7 * s, 0.6 * s, 0.35 * s, 0.6 * s);
    shape.bezierCurveTo(0.15 * s, 0.6 * s, 0, 0.45 * s, 0, 0.3 * s);
    return shape;
}

// ==================== 1) GRADIENT BOKEH BACKGROUND (Shader) ====================
// Full-screen shader quad with animated bokeh / aurora gradient
const bgShaderMat = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uScroll: { value: 0 },
        uBeat: { value: 0 },
        uSectionCount: { value: 6.0 },
        uSongTint: { value: new THREE.Vector3(0, 0, 0) }, // 曲テーマティント
        uLiveIntensity: { value: 0.0 }, // ライブ感度
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `,
    fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uMouse;
        uniform float uScroll;
        uniform float uBeat;
        uniform float uSectionCount;
        uniform vec3 uSongTint;
        uniform float uLiveIntensity;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 3; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = vUv;
            float t = uTime * 0.15;
            float sp = uScroll;
            float sectionF = sp * (uSectionCount - 1.0);
            float sectionIdx = floor(sectionF);
            float blend = smoothstep(0.0, 1.0, fract(sectionF));

            vec3 bg = vec3(0.0);

            // ==== SECTION 0: HERO — ホットピンクのコンサートステージ ====
            vec3 s0 = vec3(0.08, 0.0, 0.02);
            {
                // ピンクのグラデーション基盤
                s0 = mix(vec3(0.12, 0.0, 0.04), vec3(0.22, 0.02, 0.08), uv.y * 0.8 + fbm(uv * 2.0 + t) * 0.2);
                // 大きなピンクスポットライト中央
                float spot1 = exp(-length((uv - vec2(0.5, 0.4)) * vec2(1.0, 1.2)) * 1.5);
                s0 += vec3(1.0, 0.2, 0.45) * spot1 * 0.45;
                // 左下のコーラルグロー
                float spot2 = exp(-length((uv - vec2(0.15, 0.15)) * 1.8) * 2.0);
                s0 += vec3(1.0, 0.4, 0.3) * spot2 * 0.25;
                // 右上のローズグロー
                float spot3 = exp(-length((uv - vec2(0.85, 0.8)) * 1.8) * 2.0);
                s0 += vec3(1.0, 0.3, 0.5) * spot3 * 0.2;
                // 動くボケ玉
                for (int i = 0; i < 6; i++) {
                    float fi = float(i);
                    vec2 c = vec2(0.5 + sin(t * 0.7 + fi * 1.4) * 0.4, 0.5 + cos(t * 0.5 + fi * 1.2) * 0.4);
                    float d = length(uv - c);
                    float bk = smoothstep(0.12, 0.0, d) * 0.4;
                    s0 += mix(vec3(1.0, 0.4, 0.6), vec3(1.0, 0.7, 0.5), fi / 6.0) * bk;
                }
                // 水平レンズフレア
                float flare = exp(-abs(uv.y - 0.42) * 10.0) * exp(-pow((uv.x - 0.5) * 2.0, 2.0));
                s0 += vec3(1.0, 0.55, 0.7) * flare * 0.15;
            }

            // ==== SECTION 1: ABOUT — 夕焼けオレンジ×ゴールド ====
            vec3 s1 = vec3(0.08, 0.03, 0.0);
            {
                // 暖色グラデ（下:赤みオレンジ → 上:ゴールド）
                s1 = mix(vec3(0.18, 0.04, 0.0), vec3(0.12, 0.08, 0.01), uv.y);
                // 右上に大きな夕日グロー
                float sun = exp(-length((uv - vec2(0.8, 0.85)) * vec2(0.8, 1.0)) * 1.2);
                s1 += vec3(1.0, 0.55, 0.1) * sun * 0.5;
                // 左にアンバーグロー
                float amber = exp(-length((uv - vec2(0.1, 0.4)) * 1.5) * 1.8);
                s1 += vec3(1.0, 0.4, 0.05) * amber * 0.25;
                // ゴールデンダスト
                for (int i = 0; i < 10; i++) {
                    float fi = float(i);
                    vec2 pos = vec2(hash(vec2(fi, 1.0)), hash(vec2(1.0, fi)));
                    pos += vec2(sin(t * 0.5 + fi * 1.7), cos(t * 0.4 + fi * 1.3)) * 0.06;
                    float twk = sin(t * 4.0 + fi * 3.0) * 0.5 + 0.5;
                    float d = smoothstep(0.015, 0.0, length(uv - pos));
                    s1 += vec3(1.0, 0.85, 0.3) * d * twk * 0.5;
                }
                // 水平帯
                float band = exp(-pow((uv.y - 0.55) * 3.5, 2.0));
                s1 += vec3(1.0, 0.6, 0.15) * band * 0.1;
            }

            // ==== SECTION 2: MEMBERS — レインボー(メンバーカラー) ====
            vec3 s2 = vec3(0.02, 0.02, 0.04);
            {
                // 虹のグラデ（紫なし: 赤→橙→黄→緑→水色→ピンク）
                float hue = fract(uv.x * 0.5 + uv.y * 0.3 + t * 0.15);
                // 紫を飛ばすHSVマッピング（0-0.55の色相範囲 + ピンク）
                float mappedHue = hue * 0.55; // 赤〜水色のみ
                if (hue > 0.8) mappedHue = 0.95; // ピンク系
                vec3 rgb = clamp(abs(mod(mappedHue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
                s2 += 0.12 * mix(vec3(1.0), rgb, 0.85);
                // 10人のメンバーカラーオーブ
                vec3 mc[10];
                mc[0] = vec3(1.0, 1.0, 1.0);     // 白
                mc[1] = vec3(1.0, 0.65, 0.0);    // オレンジ
                mc[2] = vec3(0.5, 0.85, 1.0);    // 水色
                mc[3] = vec3(1.0, 0.7, 0.78);    // 薄ピンク
                mc[4] = vec3(1.0, 0.1, 0.1);     // 赤
                mc[5] = vec3(1.0, 0.84, 0.0);    // 黄
                mc[6] = vec3(1.0, 0.2, 0.6);     // ピンク系（紫の代わり）
                mc[7] = vec3(0.1, 0.75, 0.25);   // 緑
                mc[8] = vec3(0.2, 0.4, 1.0);     // 青
                mc[9] = vec3(1.0, 0.1, 0.55);    // ディープピンク
                for (int i = 0; i < 10; i++) {
                    float fi = float(i);
                    vec2 op = vec2(
                        0.08 + fi * 0.09 + sin(t * 0.5 + fi * 1.1) * 0.04,
                        0.5 + cos(t * 0.4 + fi * 0.8) * 0.32
                    );
                    float orb = exp(-length(uv - op) * 3.5);
                    s2 += mc[i] * orb * 0.12;
                }
                // ピンクのセンターグロー
                float cg = exp(-length(uv - vec2(0.5)) * 2.0);
                s2 += vec3(1.0, 0.4, 0.6) * cg * 0.1;
                // キラキラグリッド
                float grid = smoothstep(0.96, 1.0, sin(uv.x * 30.0)) * smoothstep(0.96, 1.0, sin(uv.y * 30.0));
                s2 += vec3(1.0, 0.9, 0.5) * grid * 0.06;
            }

            // ==== SECTION 3: MUSIC — ネオンシアン×ティール ====
            vec3 s3 = vec3(0.01, 0.04, 0.08);
            {
                float n = fbm(uv * 3.0 + t * 0.5);
                s3 = mix(vec3(0.01, 0.04, 0.1), vec3(0.02, 0.08, 0.14), n);
                // 大きなシアングロー
                float cyanGlow = exp(-length(uv - vec2(0.5, 0.5)) * 1.8);
                s3 += vec3(0.0, 0.9, 1.0) * cyanGlow * 0.3;
                // コーナーにピンクグロー（紫ではなくピンク！）
                float pg1 = exp(-length(uv - vec2(0.0, 0.0)) * 2.5);
                float pg2 = exp(-length(uv - vec2(1.0, 1.0)) * 2.5);
                s3 += vec3(1.0, 0.2, 0.5) * (pg1 + pg2) * 0.12;
                // スキャンライン
                float scan = sin(uv.y * 80.0 + t * 4.0) * 0.5 + 0.5;
                s3 += vec3(0.0, 1.0, 0.9) * scan * 0.02;
                // イコライザーバー
                for (int i = 0; i < 14; i++) {
                    float fi = float(i);
                    float bx = 0.07 + fi * 0.063;
                    float bh = 0.12 + sin(t * 5.0 + fi * 0.9) * 0.1 + uBeat * 0.2;
                    float bar = smoothstep(bx - 0.013, bx, uv.x) * smoothstep(bx + 0.013, bx, uv.x);
                    bar *= smoothstep(0.0, bh, uv.y) * smoothstep(bh + 0.01, bh, uv.y);
                    vec3 bc = mix(vec3(0.0, 1.0, 0.9), vec3(1.0, 0.3, 0.5), fi / 14.0);
                    s3 += bc * bar * 0.35 * (1.0 + uBeat * 3.0);
                }
                // パルスリング
                for (int i = 0; i < 2; i++) {
                    float fi = float(i);
                    float ring = abs(length(uv - vec2(0.5)) - 0.18 - fi * 0.12 - sin(t * 2.0 + fi) * 0.04);
                    ring = smoothstep(0.006, 0.0, ring);
                    s3 += vec3(0.0, 1.0, 1.0) * ring * 0.12 * (1.0 + uBeat * 2.0);
                }
                // 電撃スパーク
                float sp2 = noise(uv * 25.0 + t * 10.0);
                sp2 = smoothstep(0.83, 1.0, sp2);
                s3 += vec3(0.3, 1.0, 0.9) * sp2 * 0.15;
            }

            // ==== SECTION 4: DISCOGRAPHY — ワインレッド×ローズ ====
            vec3 s4 = vec3(0.08, 0.01, 0.03);
            {
                float radial = length(uv - vec2(0.5));
                s4 = mix(vec3(0.18, 0.03, 0.06), vec3(0.08, 0.01, 0.03), radial);
                // 暖かいセンターグロー
                float cw = exp(-radial * 1.8);
                s4 += vec3(1.0, 0.25, 0.35) * cw * 0.3;
                // バイナルレコード溝
                float rings = sin(radial * 50.0 + t * 1.5) * 0.5 + 0.5;
                float vmask = smoothstep(0.04, 0.09, radial) * smoothstep(0.42, 0.32, radial);
                s4 += vec3(1.0, 0.4, 0.5) * rings * vmask * 0.1;
                // ラベルグロー
                float lbl = smoothstep(0.1, 0.0, radial);
                s4 += vec3(1.0, 0.6, 0.4) * lbl * 0.3;
                // 回転エフェクト
                float ang = atan(uv.y - 0.5, uv.x - 0.5);
                float spin = sin(ang * 3.0 + t * 2.0) * 0.5 + 0.5;
                s4 += vec3(1.0, 0.3, 0.45) * spin * vmask * 0.06;
                // ローズペタルブロブ
                for (int i = 0; i < 6; i++) {
                    float fi = float(i);
                    vec2 rp = vec2(0.5 + sin(t * 0.35 + fi * 1.1) * 0.35, 0.5 + cos(t * 0.45 + fi * 1.5) * 0.35);
                    float ptl = exp(-length(uv - rp) * 3.5);
                    vec3 pc = mix(vec3(1.0, 0.3, 0.4), vec3(1.0, 0.55, 0.5), sin(fi + t) * 0.5 + 0.5);
                    s4 += pc * ptl * 0.1;
                }
                // キラキラダスト
                float sh = noise(uv * 18.0 + t * 1.5);
                sh = smoothstep(0.65, 0.85, sh);
                s4 += vec3(1.0, 0.8, 0.7) * sh * 0.08;
            }

            // ==== SECTION 5: INFO — ゴールド×スタジアム夜景 ====
            vec3 s5 = vec3(0.02, 0.02, 0.04);
            {
                s5 = mix(vec3(0.06, 0.05, 0.02), vec3(0.02, 0.02, 0.04), uv.y);
                // 4つのスタジアム照明
                for (int i = 0; i < 4; i++) {
                    float fi = float(i);
                    vec2 lp = vec2(0.1 + fi * 0.27, 1.15);
                    float beam = exp(-length((uv - lp) * vec2(2.0, 0.5)) * 1.2);
                    s5 += vec3(1.0, 0.88, 0.4) * beam * 0.25;
                }
                // ゴールデン地平線
                float hz = exp(-pow((uv.y - 0.12) * 3.5, 2.0));
                s5 += vec3(1.0, 0.7, 0.15) * hz * 0.2;
                // 星
                for (int i = 0; i < 15; i++) {
                    float fi = float(i);
                    vec2 sp2 = vec2(hash(vec2(fi, 3.0)), 0.4 + hash(vec2(3.0, fi)) * 0.6);
                    float twk = sin(t * 5.0 + fi * 2.5) * 0.5 + 0.5;
                    float star = smoothstep(0.007, 0.0, length(uv - sp2));
                    s5 += vec3(1.0, 0.95, 0.7) * star * twk * 0.8;
                    float halo = exp(-length(uv - sp2) * 30.0);
                    s5 += vec3(1.0, 0.85, 0.5) * halo * twk * 0.03;
                }
                // カウントダウングロー
                float cdg = exp(-length((uv - vec2(0.5, 0.1)) * vec2(1.0, 2.0)) * 1.2);
                s5 += vec3(1.0, 0.75, 0.15) * cdg * 0.2;
                // カラフル紙吹雪
                float conf = noise(uv * 16.0 + t * 4.0);
                conf = smoothstep(0.8, 1.0, conf);
                vec3 cc = vec3(
                    sin(conf * 10.0 + t) * 0.5 + 0.5,
                    sin(conf * 10.0 + t + 2.0) * 0.5 + 0.5,
                    sin(conf * 10.0 + t + 4.0) * 0.5 + 0.5
                );
                s5 += cc * conf * 0.15;
            }

            // ============ ブレンド ============
            if (sectionIdx < 0.5) {
                bg = mix(s0, s1, blend);
            } else if (sectionIdx < 1.5) {
                bg = mix(s1, s2, blend);
            } else if (sectionIdx < 2.5) {
                bg = mix(s2, s3, blend);
            } else if (sectionIdx < 3.5) {
                bg = mix(s3, s4, blend);
            } else if (sectionIdx < 4.5) {
                bg = mix(s4, s5, blend);
            } else {
                bg = s5;
            }

            // ビネット（弱め）
            float vig = 1.0 - smoothstep(0.6, 1.6, length((uv - 0.5) * 1.6));
            bg *= vig * 0.9 + 0.1;

            // ビートフラッシュ
            bg += vec3(1.0, 0.4, 0.6) * uBeat * 0.06;

            // マウスライト
            float ml = exp(-length(uv - uMouse) * 4.0) * 0.04;
            bg += vec3(1.0, 0.8, 0.7) * ml;

            // 曲テーマティント（音楽再生中は背景全体が曲のカラーに染まる）
            bg += uSongTint * uLiveIntensity * (0.08 + uBeat * 0.15);
            // ビートフラッシュ（曲テーマ色）
            vec3 flashColor = length(uSongTint) > 0.01 ? uSongTint : vec3(1.0, 0.4, 0.6);
            bg += flashColor * uBeat * uLiveIntensity * 0.12;

            gl_FragColor = vec4(bg, 1.0);
        }
    `,
    depthWrite: false,
    depthTest: false,
});

const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgShaderMat);
bgQuad.frustumCulled = false;
bgQuad.renderOrder = -1000;
scene.add(bgQuad);

// ==================== 2) SAKURA PETAL SYSTEM (Cherry Blossoms) ====================
const sakuraCount = 80;
const sakuraGroup = new THREE.Group();
const sakuraPetals = [];

const petalShape = new THREE.Shape();
petalShape.moveTo(0, 0);
petalShape.bezierCurveTo(0.15, 0.15, 0.12, 0.4, 0, 0.5);
petalShape.bezierCurveTo(-0.12, 0.4, -0.15, 0.15, 0, 0);

const petalGeo = new THREE.ShapeGeometry(petalShape);

for (let i = 0; i < sakuraCount; i++) {
    const pink = Math.random();
    const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.93 + pink * 0.05, 0.5 + pink * 0.3, 0.75 + pink * 0.2),
        transparent: true,
        opacity: Math.random() * 0.3 + 0.15,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const petal = new THREE.Mesh(petalGeo, mat);
    const scale = Math.random() * 0.12 + 0.04;
    petal.scale.set(scale, scale, scale);
    petal.position.set(
        (Math.random() - 0.5) * 25,
        Math.random() * 20 + 5,
        (Math.random() - 0.5) * 10 + 2
    );
    petal.userData = {
        fallSpeed: Math.random() * 0.008 + 0.003,
        swaySpeed: Math.random() * 1.5 + 0.5,
        swayAmount: Math.random() * 0.02 + 0.005,
        rotSpeedX: (Math.random() - 0.5) * 0.02,
        rotSpeedY: (Math.random() - 0.5) * 0.015,
        rotSpeedZ: (Math.random() - 0.5) * 0.025,
        startX: petal.position.x,
    };
    sakuraGroup.add(petal);
    sakuraPetals.push(petal);
}
scene.add(sakuraGroup);

// ==================== 3) AURORA RIBBON (メンバーカラーの光の帯) ====================
const ribbonCount = 3;
const ribbons = [];

for (let r = 0; r < ribbonCount; r++) {
    const points = [];
    const segCount = 40;
    for (let i = 0; i < segCount; i++) {
        points.push(new THREE.Vector3(
            (i / segCount - 0.5) * 16,
            Math.sin(i * 0.3) * 0.5 + 3,
            -1 - r * 1.0
        ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 100, 0.03 + r * 0.008, 8, false);

    const colorIdx = r * 2;
    const c1 = penlightColors[colorIdx % penlightColors.length];
    const c2 = penlightColors[(colorIdx + 1) % penlightColors.length];

    const ribbonMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor1: { value: c1 },
            uColor2: { value: c2 },
            uBeat: { value: 0 },
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPos;
            void main() {
                vUv = uv;
                vPos = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            precision highp float;
            varying vec2 vUv;
            varying vec3 vPos;
            uniform float uTime;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform float uBeat;

            void main() {
                float wave = sin(vUv.x * 12.0 + uTime * 2.0) * 0.5 + 0.5;
                vec3 color = mix(uColor1, uColor2, wave);
                float edge = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
                float alpha = edge * (0.12 + uBeat * 0.15) * (0.5 + wave * 0.5);
                float glow = exp(-abs(vUv.y - 0.5) * 5.0) * 0.15 * (1.0 + uBeat * 2.0);
                gl_FragColor = vec4(color, alpha + glow);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    const ribbon = new THREE.Mesh(tubeGeo, ribbonMat);
    ribbon.userData = {
        basePoints: points.map(p => p.clone()),
        curve,
        segCount,
        speed: 0.3 + r * 0.1,
        amplitude: 0.5 + r * 0.2,
        phaseOffset: r * Math.PI * 0.4,
    };
    scene.add(ribbon);
    ribbons.push(ribbon);
}

// ==================== 4) PENLIGHT SEA (Concert crowd effect) ====================
const penlightCount = 3000;
const penlightGeo = new THREE.BufferGeometry();
const plPositions = new Float32Array(penlightCount * 3);
const plColors = new Float32Array(penlightCount * 3);
const plPhases = new Float32Array(penlightCount);

for (let i = 0; i < penlightCount; i++) {
    const i3 = i * 3;
    // GLBステージの前方（Z+方向）にアリーナ状に広がる
    const angle = (Math.random() - 0.5) * Math.PI * 1.0;
    const dist = Math.random() * 15 + 3;
    const tier = Math.floor(Math.random() * 5); // 階層（5段）
    plPositions[i3] = Math.sin(angle) * dist;
    plPositions[i3 + 1] = -5 + tier * 1.2 + (Math.random() - 0.5) * 0.8;
    plPositions[i3 + 2] = 2 + Math.cos(angle) * dist * 0.4 + tier * 1.5;

    const color = penlightColors[Math.floor(Math.random() * penlightColors.length)];
    plColors[i3] = color.r;
    plColors[i3 + 1] = color.g;
    plColors[i3 + 2] = color.b;
    plPhases[i] = Math.random() * Math.PI * 2;
}

penlightGeo.setAttribute('position', new THREE.BufferAttribute(plPositions, 3));
penlightGeo.setAttribute('color', new THREE.BufferAttribute(plColors, 3));

const penlightMat = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});

const penlightParticles = new THREE.Points(penlightGeo, penlightMat);
scene.add(penlightParticles);

// ==================== 5) "=" SIGN PARTICLES ====================
const equalParticleCount = 500;
const equalGeo = new THREE.BufferGeometry();
const eqPositions = new Float32Array(equalParticleCount * 3);
const eqColors = new Float32Array(equalParticleCount * 3);
const eqOriginal = new Float32Array(equalParticleCount * 3);

for (let i = 0; i < equalParticleCount; i++) {
    const i3 = i * 3;
    let x, y;
    if (i < equalParticleCount / 2) {
        x = (Math.random() - 0.5) * 2.8;
        y = 0.4 + (Math.random() - 0.5) * 0.18;
    } else {
        x = (Math.random() - 0.5) * 2.8;
        y = -0.4 + (Math.random() - 0.5) * 0.18;
    }
    eqOriginal[i3] = x;
    eqOriginal[i3 + 1] = y;
    eqOriginal[i3 + 2] = 0;
    eqPositions[i3] = (Math.random() - 0.5) * 18;
    eqPositions[i3 + 1] = (Math.random() - 0.5) * 18;
    eqPositions[i3 + 2] = (Math.random() - 0.5) * 12;

    const pinkShade = Math.random();
    eqColors[i3] = 1.0;
    eqColors[i3 + 1] = 0.1 + pinkShade * 0.5;
    eqColors[i3 + 2] = 0.5 + pinkShade * 0.4;
}

equalGeo.setAttribute('position', new THREE.BufferAttribute(eqPositions, 3));
equalGeo.setAttribute('color', new THREE.BufferAttribute(eqColors, 3));

const equalMat = new THREE.PointsMaterial({
    size: 0.07,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});

const equalParticles = new THREE.Points(equalGeo, equalMat);
equalParticles.position.z = 1;
scene.add(equalParticles);

let equalFormed = false;
let equalFormProgress = 0;

// ==================== 6) FLOATING HEARTS (3D) ====================
const hearts3D = [];
for (let i = 0; i < 15; i++) {
    const heartShape = createHeartShape(1);
    const extrudeSettings = {
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 4,
    };
    const geo = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
    const color = penlightColors[i % penlightColors.length];
    const mat = new THREE.MeshBasicMaterial({
        color: color,
        wireframe: Math.random() > 0.3,
        transparent: true,
        opacity: Math.random() * 0.1 + 0.02,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const scale = Math.random() * 0.7 + 0.15;
    mesh.scale.set(scale, scale, scale);
    mesh.position.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 8 + 2
    );
    mesh.rotation.z = Math.PI;
    mesh.userData = {
        rotSpeed: { x: Math.random() * 0.005, y: Math.random() * 0.007, z: Math.random() * 0.004 },
        floatSpeed: Math.random() * 0.6 + 0.2,
        floatAmplitude: Math.random() * 1.0 + 0.4,
        initialY: mesh.position.y,
        initialX: mesh.position.x,
        driftSpeed: Math.random() * 0.25 + 0.05,
    };
    scene.add(mesh);
    hearts3D.push(mesh);
}

// ==================== 7) CONCERT STAGE LIGHTING (Animated spotlights) ====================
const rayGroup = new THREE.Group();
const rayCount = 8;
const raysArr = [];

for (let i = 0; i < rayCount; i++) {
    const rayGeo = new THREE.CylinderGeometry(0.01, 0.2, 14, 8, 1, true);
    const color = penlightColors[Math.floor(Math.random() * penlightColors.length)];
    const rayMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ray = new THREE.Mesh(rayGeo, rayMat);
    ray.position.set((i - rayCount / 2) * 2.2, 8, -6);
    ray.userData = {
        rotSpeed: Math.random() * 0.006 + 0.002,
        swaySpeed: Math.random() * 0.4 + 0.15,
        swayAmount: Math.random() * 0.5 + 0.15,
        initialX: ray.position.x,
        baseOpacity: 0.06,
    };
    rayGroup.add(ray);
    raysArr.push(ray);
}
scene.add(rayGroup);

// ==================== 8) SPARKLE STARS ====================
const sparkleCount = 150;
const sparkleGeo = new THREE.BufferGeometry();
const sparklePositions = new Float32Array(sparkleCount * 3);
const sparkleSizes = new Float32Array(sparkleCount);

for (let i = 0; i < sparkleCount; i++) {
    const i3 = i * 3;
    sparklePositions[i3] = (Math.random() - 0.5) * 25;
    sparklePositions[i3 + 1] = (Math.random() - 0.5) * 25;
    sparklePositions[i3 + 2] = (Math.random() - 0.5) * 18;
    sparkleSizes[i] = Math.random();
}

sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));

const sparkleMat = new THREE.PointsMaterial({
    size: 0.03,
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});

const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
scene.add(sparkles);

// ==================== 9) SONG LYRIC TEXT PARTICLES ====================
// Floating =LOVE song titles / lyrics
const lyricTexts = [
    '=LOVE', 'ズルいよ ズルいね', '探せ ダイヤモンドリリー',
    'Want you! Want you!', '手遅れcaution', 'ウィークエンドシトロン',
    '青春"サブリミナル"', 'CAMEO', '呪って呪って',
    '絶対アイドル辞めないで', 'この空がトリガー', 'ナツマトペ',
    'あの子コンプレックス', 'SwEEt coming!', 'LOVE',
];

const lyricParticles = [];
const lyricCanvas = document.createElement('canvas');
const lyricCtx = lyricCanvas.getContext('2d');

function createLyricSprite(text) {
    lyricCanvas.width = 512;
    lyricCanvas.height = 64;
    lyricCtx.clearRect(0, 0, 512, 64);
    lyricCtx.font = '600 28px "Noto Sans JP", sans-serif';
    lyricCtx.fillStyle = '#ffffff';
    lyricCtx.textAlign = 'center';
    lyricCtx.textBaseline = 'middle';
    lyricCtx.fillText(text, 256, 32);

    const texture = new THREE.CanvasTexture(lyricCanvas);
    texture.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 0.5, 1);
    sprite.position.set(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 8 - 4
    );
    sprite.userData = {
        targetOpacity: Math.random() * 0.08 + 0.02,
        floatSpeed: Math.random() * 0.3 + 0.1,
        floatAmplitude: Math.random() * 0.5 + 0.2,
        driftX: (Math.random() - 0.5) * 0.001,
        initialY: sprite.position.y,
        text: text,
        fadePhase: Math.random() * Math.PI * 2,
    };
    scene.add(sprite);
    lyricParticles.push(sprite);
}

lyricTexts.forEach(t => createLyricSprite(t));

// ==================== MOUSE / INTERACTION ====================
const mouse = { x: 0, y: 0, targetX: 0, targetY: 0, rawX: 0, rawY: 0 };
const cursorFollower = document.getElementById('cursor-follower');
const cursorTrail = document.getElementById('cursor-trail');
const penlightOverlay = document.getElementById('penlight-overlay');
let penlightMode = false;
const trailDots = [];

document.addEventListener('mousemove', (e) => {
    mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    mouse.rawX = e.clientX;
    mouse.rawY = e.clientY;

    if (cursorFollower) {
        cursorFollower.style.left = e.clientX + 'px';
        cursorFollower.style.top = e.clientY + 'px';
    }

    if (penlightMode && penlightOverlay) {
        penlightOverlay.style.setProperty('--px', e.clientX + 'px');
        penlightOverlay.style.setProperty('--py', e.clientY + 'px');
    }

    if (cursorTrail && window.innerWidth > 768) {
        const dot = document.createElement('div');
        dot.className = 'trail-dot';
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
        if (penlightMode) {
            const c = penlightColors[Math.floor(Math.random() * penlightColors.length)];
            dot.style.background = `rgb(${Math.floor(c.r * 255)}, ${Math.floor(c.g * 255)}, ${Math.floor(c.b * 255)})`;
            dot.style.width = '10px';
            dot.style.height = '10px';
        }
        cursorTrail.appendChild(dot);
        setTimeout(() => dot.remove(), 600);
    }
});

// Click ripple effect
document.addEventListener('click', (e) => {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
        position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
        width: 10px; height: 10px; border-radius: 50%;
        border: 2px solid #ff69b4; pointer-events: none; z-index: 9998;
        transform: translate(-50%, -50%);
        animation: rippleOut 0.6s ease forwards;
    `;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
});

const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes rippleOut {
        to { width: 100px; height: 100px; opacity: 0; border-color: transparent; }
    }
`;
document.head.appendChild(rippleStyle);

// Hover effects
document.querySelectorAll('a, button, .btn-primary, .btn-secondary, .btn-penlight, .member-card, .about-card, .disco-slide, .info-card, .sister-card, .social-link, .carousel-btn, .fab, .music-card').forEach(el => {
    el.addEventListener('mouseenter', () => cursorFollower?.classList.add('hover'));
    el.addEventListener('mouseleave', () => cursorFollower?.classList.remove('hover'));
});

// ==================== PENLIGHT MODE（大幅強化） ====================
const penlightBtn = document.getElementById('penlight-btn');
let penlightColorIndex = 0;
let penlightAutoColor = true; // 曲テーマに合わせて自動変色
let penlightWaveMode = 'wave'; // wave, jump, sync
let penlightClickCount = 0; // 連打カウンター
let penlightCombo = 0; // コンボ数
let penlightComboTimer = null;

penlightBtn?.addEventListener('click', () => {
    penlightMode = !penlightMode;
    penlightBtn.classList.toggle('active', penlightMode);
    penlightOverlay?.classList.toggle('active', penlightMode);
    if (penlightMode) {
        penlightMat.opacity = 0.9;
        penlightMat.size = 0.1;
        createPenlightFlash();
        startPenlightColorCycle();
        showPenlightUI();
    } else {
        penlightMat.opacity = 0.7;
        penlightMat.size = 0.06;
        stopPenlightColorCycle();
        hidePenlightUI();
    }
});

// ペンライトUI（モード切替・カラー選択・コンボ表示）
function showPenlightUI() {
    if (document.getElementById('penlight-ui')) return;
    const isMobile = window.innerWidth <= 768;
    const ui = document.createElement('div');
    ui.id = 'penlight-ui';
    ui.innerHTML = `
        <div style="position:fixed;bottom:${isMobile ? '80px' : '120px'};left:50%;transform:translateX(-50%);z-index:9999;
            display:flex;gap:${isMobile ? '6px' : '8px'};align-items:center;padding:${isMobile ? '8px 12px' : '10px 18px'};border-radius:30px;
            background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);border:1px solid rgba(255,105,180,0.4);
            max-width:${isMobile ? '94vw' : 'none'};flex-wrap:${isMobile ? 'wrap' : 'nowrap'};justify-content:center;">
            <div style="display:flex;gap:4px;${isMobile ? 'overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:60vw;padding:4px 0;' : ''}" id="pl-color-dots"></div>
            <span style="color:#fff;font-size:10px;margin:0 6px;${isMobile ? 'display:none;' : ''}">|</span>
            <button id="pl-mode-btn" style="background:none;border:1px solid #ff69b4;color:#ff69b4;
                padding:${isMobile ? '6px 14px' : '4px 10px'};border-radius:15px;font-size:${isMobile ? '13px' : '11px'};cursor:pointer;font-family:inherit;
                min-height:${isMobile ? '40px' : 'auto'};">WAVE</button>
            <button id="pl-tap-btn" style="background:linear-gradient(135deg,#ff1493,#ff69b4);border:none;color:#fff;
                width:${isMobile ? '60px' : '48px'};height:${isMobile ? '60px' : '48px'};border-radius:50%;font-size:${isMobile ? '26px' : '20px'};cursor:pointer;
                box-shadow:0 0 15px rgba(255,20,147,0.5);transition:transform 0.1s;
                -webkit-tap-highlight-color:transparent;touch-action:manipulation;">🔦</button>
            <div id="pl-combo" style="color:#ffd700;font-weight:bold;font-size:${isMobile ? '16px' : '14px'};min-width:50px;text-align:center;"></div>
        </div>
    `;
    document.body.appendChild(ui);

    // カラードット生成
    const dotsContainer = document.getElementById('pl-color-dots');
    penlightColors.forEach((c, i) => {
        const dot = document.createElement('div');
        const hex = '#' + c.getHexString();
        dot.style.cssText = `width:16px;height:16px;border-radius:50%;background:${hex};
            cursor:pointer;border:2px solid ${i === penlightColorIndex ? '#fff' : 'transparent'};
            transition:border 0.2s, transform 0.2s;`;
        dot.addEventListener('click', () => {
            penlightColorIndex = i;
            penlightAutoColor = false;
            penlightOverlay?.style.setProperty('--pl-color', hex);
            document.querySelectorAll('#pl-color-dots > div').forEach((d, j) => {
                d.style.borderColor = j === i ? '#fff' : 'transparent';
            });
        });
        dotsContainer.appendChild(dot);
    });
    // 自動カラーボタン
    const autoDot = document.createElement('div');
    autoDot.style.cssText = `width:16px;height:16px;border-radius:50%;cursor:pointer;
        background:conic-gradient(red,orange,yellow,green,cyan,blue,purple,red);
        border:2px solid ${penlightAutoColor ? '#fff' : 'transparent'};`;
    autoDot.title = 'AUTO（曲に合わせる）';
    autoDot.addEventListener('click', () => {
        penlightAutoColor = true;
        document.querySelectorAll('#pl-color-dots > div').forEach(d => d.style.borderColor = 'transparent');
        autoDot.style.borderColor = '#fff';
    });
    dotsContainer.appendChild(autoDot);

    // モード切替
    document.getElementById('pl-mode-btn').addEventListener('click', () => {
        const modes = ['wave', 'jump', 'sync'];
        const labels = ['WAVE', 'JUMP', 'SYNC'];
        const idx = (modes.indexOf(penlightWaveMode) + 1) % modes.length;
        penlightWaveMode = modes[idx];
        document.getElementById('pl-mode-btn').textContent = labels[idx];
    });

    // タップボタン（ビートに合わせて叩く → コンボ）
    const tapBtn = document.getElementById('pl-tap-btn');
    tapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        penlightClickCount++;
        penlightCombo++;
        clearTimeout(penlightComboTimer);
        penlightComboTimer = setTimeout(() => { penlightCombo = 0; updateComboDisplay(); }, 2000);
        updateComboDisplay();
        // 叩くたびにビート感をブースト
        musicBeat = Math.min(1.0, musicBeat + 0.3);
        tapBtn.style.transform = 'scale(0.85)';
        setTimeout(() => tapBtn.style.transform = 'scale(1)', 100);
        // パーティクルバースト
        createTapBurst(e.clientX || window.innerWidth / 2, e.clientY || window.innerHeight - 150);
        // コンボボーナス
        if (penlightCombo === 10) showPenlightToast('🔥 10 COMBO!');
        if (penlightCombo === 30) showPenlightToast('⚡ 30 COMBO!! FEVER!');
        if (penlightCombo === 50) {
            showPenlightToast('🌈 50 COMBO!!! RAINBOW!');
            triggerRainbowMode();
        }
        if (penlightCombo >= 100 && penlightCombo % 50 === 0) {
            showPenlightToast(`💎 ${penlightCombo} COMBO!!!! LEGEND!`);
        }
    });
}

function hidePenlightUI() {
    document.getElementById('penlight-ui')?.remove();
}

function updateComboDisplay() {
    const el = document.getElementById('pl-combo');
    if (el) {
        if (penlightCombo > 0) {
            el.textContent = `${penlightCombo}x`;
            el.style.color = penlightCombo >= 50 ? '#ff1493' : penlightCombo >= 30 ? '#ffd700' : penlightCombo >= 10 ? '#00bfff' : '#fff';
            el.style.transform = `scale(${1 + Math.min(penlightCombo * 0.01, 0.5)})`;
        } else {
            el.textContent = '';
        }
    }
}

function createTapBurst(x, y) {
    const colors = ['#ff1493', '#ff69b4', '#ffd700', '#00bfff', '#ff4500', '#00ff7f'];
    for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        const angle = (Math.PI * 2 * i) / 8;
        const dist = 40 + Math.random() * 60;
        const c = colors[Math.floor(Math.random() * colors.length)];
        p.style.cssText = `
            position:fixed;left:${x}px;top:${y}px;width:6px;height:6px;border-radius:50%;
            background:${c};pointer-events:none;z-index:10000;
            transition:all 0.5s ease-out;opacity:1;
        `;
        document.body.appendChild(p);
        requestAnimationFrame(() => {
            p.style.left = (x + Math.cos(angle) * dist) + 'px';
            p.style.top = (y + Math.sin(angle) * dist) + 'px';
            p.style.opacity = '0';
            p.style.transform = 'scale(0)';
        });
        setTimeout(() => p.remove(), 600);
    }
}

function showPenlightToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `
        position:fixed;bottom:180px;left:50%;transform:translateX(-50%) scale(0.8);
        color:#fff;font-weight:bold;font-size:18px;z-index:10001;pointer-events:none;
        text-shadow:0 0 10px #ff1493, 0 0 20px #ff69b4;
        transition:all 0.4s ease-out;opacity:0;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
        t.style.opacity = '1';
        t.style.transform = 'translateX(-50%) scale(1) translateY(-20px)';
    });
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(-50%) scale(1.2) translateY(-50px)';
        setTimeout(() => t.remove(), 400);
    }, 1500);
}

function triggerRainbowMode() {
    // 一時的にペンライト全体がレインボーに
    const origColors = new Float32Array(plColors);
    const rainbow = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x00aaff, 0x0000ff, 0xaa00ff, 0xff00aa];
    for (let i = 0; i < penlightCount; i++) {
        const c = new THREE.Color(rainbow[i % rainbow.length]);
        plColors[i * 3] = c.r;
        plColors[i * 3 + 1] = c.g;
        plColors[i * 3 + 2] = c.b;
    }
    penlightGeo.attributes.color.needsUpdate = true;
    setTimeout(() => {
        plColors.set(origColors);
        penlightGeo.attributes.color.needsUpdate = true;
    }, 5000);
}

let penlightCycleInterval = null;
function startPenlightColorCycle() {
    if (penlightCycleInterval) return;
    penlightCycleInterval = setInterval(() => {
        if (!penlightAutoColor) return;
        // 曲テーマがあればそのカラーに合わせる
        if (currentSongTheme) {
            const p = currentSongTheme.primary;
            const hex = '#' + new THREE.Color(p[0], p[1], p[2]).getHexString();
            penlightOverlay?.style.setProperty('--pl-color', hex);
        } else {
            penlightColorIndex = (penlightColorIndex + 1) % penlightColors.length;
            const c = penlightColors[penlightColorIndex];
            penlightOverlay?.style.setProperty('--pl-color', '#' + c.getHexString());
        }
    }, 3000);
}
function stopPenlightColorCycle() {
    clearInterval(penlightCycleInterval);
    penlightCycleInterval = null;
}

function createPenlightFlash() {
    const flash = document.createElement('div');
    flash.className = 'penlight-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 800);
    for (let i = 0; i < 20; i++) {
        const spark = document.createElement('div');
        spark.className = 'penlight-spark';
        const angle = (Math.PI * 2 * i) / 20;
        const dist = 100 + Math.random() * 200;
        spark.style.cssText = `
            --spark-x: ${Math.cos(angle) * dist}px;
            --spark-y: ${Math.sin(angle) * dist}px;
            left: 50%; top: 50%;
        `;
        document.body.appendChild(spark);
        setTimeout(() => spark.remove(), 1000);
    }
}

// ==================== HAMBURGER MENU ====================
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger?.addEventListener('click', () => {
    // 探索モード中はまず探索モードを解除する
    if (exploreMode) {
        toggleExploreMode();
    }
    hamburger.classList.toggle('active');
    mobileMenu?.classList.toggle('active');
});

document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
        // 探索モード中にナビリンクをクリックしたら探索モードも解除
        if (exploreMode) {
            toggleExploreMode();
        }
        hamburger?.classList.remove('active');
        mobileMenu?.classList.remove('active');
    });
});

// デスクトップナビリンクでも探索モード解除
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        if (exploreMode) {
            toggleExploreMode();
        }
    });
});

// ==================== MEMBER CARDS INTERACTION ====================
const memberCards = document.querySelectorAll('.member-card');
const modal = document.getElementById('member-modal');

memberCards.forEach(card => {
    const color1 = card.dataset.color;
    const color2 = card.dataset.color2;
    card.style.setProperty('--card-color', color1);
    card.style.setProperty('--card-glow', color1 + '30');
    card.querySelector('.member-penlight-bar').style.background =
        `linear-gradient(90deg, ${color1}, ${color2})`;

    card.addEventListener('click', () => {
        const img = card.querySelector('.member-img');
        const name = card.querySelector('.member-info h3');
        const nameEn = card.querySelector('.member-name-en');

        document.getElementById('modal-img').src = img.src;
        document.getElementById('modal-name').textContent = name.textContent;
        document.getElementById('modal-name-en').textContent = nameEn.textContent;
        document.getElementById('modal-nickname').textContent = card.dataset.nickname;
        document.getElementById('modal-birthday').textContent = card.dataset.birthday;
        document.getElementById('modal-from').textContent = card.dataset.from;
        document.getElementById('modal-penlight').textContent = card.dataset.penlight;

        document.getElementById('swatch-1').style.background = color1;
        document.getElementById('swatch-2').style.background = color2;

        document.querySelector('.modal-penlight-glow').style.setProperty('--modal-color', color1 + '50');
        document.querySelector('.modal-content').style.borderColor = color1 + '30';

        // Fill extended profile data
        const ext = memberExtendedData[name.textContent];
        if (ext) {
            document.getElementById('modal-height').textContent = ext.height || '-';
            document.getElementById('modal-blood').textContent = ext.blood || '-';
            document.getElementById('modal-fanname').textContent = ext.fanName || '-';
            document.getElementById('modal-role').textContent = ext.role || '-';
            document.getElementById('modal-career').textContent = ext.career || '-';
            document.getElementById('modal-center').textContent = ext.centerSongs || '-';
            document.getElementById('modal-solo').textContent = ext.solo || '-';
            // Trivia
            const triviaEl = document.getElementById('modal-trivia-list');
            triviaEl.innerHTML = (ext.trivia || []).map(t => `<div class="trivia-item"><span class="trivia-bullet">★</span>${t}</div>`).join('');
            // History
            document.getElementById('modal-history-text').innerHTML = ext.history || '';
        }

        // Reset tabs
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.modal-tab[data-tab="profile"]')?.classList.add('active');
        document.getElementById('tab-profile')?.classList.add('active');

        modal?.classList.add('active');
        document.body.classList.add('modal-open');

        // Start 3D particle effect in modal
        startModal3D(color1, color2);

        // Show member bonus popup after short delay
        setTimeout(() => showMemberBonus(name.textContent, color1, color2), 600);
    });
});

// Close modal
function closeModal() {
    modal?.classList.remove('active');
    document.body.classList.remove('modal-open');
    stopModal3D();
}
document.querySelector('.modal-close')?.addEventListener('click', closeModal);
document.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

// iOS Safari: モーダル背景のタッチスクロール防止
document.querySelector('.modal-backdrop')?.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        // 動画オーバーレイも閉じる
        closeVideoOverlay();
    }
});

// ==================== DISCOGRAPHY CAROUSEL ====================
// Fix jacket images — use MV thumbnails as fallback
const discoJacketMap = {
    '17th': 'nUuGLmfPGOI',  // 絶対アイドル辞めないで
    '16th': 'GN2GvBVKsz4',  // 呪って呪って
    '15th': 'N9VEgTqsXOE',  // ラストノートしか知らない
    '14th': '4BPGMS2O3YA',  // ナツマトペ
    '13th': 'eYBqKxiNHSs',  // この空がトリガー
    '19th': '4PIHM-jtXpY',  // ラブソングに襲われる
    '18th': 'J_g2P1Rfthg',  // とくべチュして
};
document.querySelectorAll('.disco-jacket').forEach(jacket => {
    const placeholder = jacket.querySelector('.jacket-placeholder');
    if (placeholder) {
        const numText = placeholder.querySelector('span')?.textContent;
        const key = numText ? numText.replace(/[^0-9]/g, '') + (numText.includes('th') ? 'th' : 'th') : '';
        const realKey = Object.keys(discoJacketMap).find(k => k.replace('th', '') === numText?.replace('th', ''));
        if (realKey && discoJacketMap[realKey]) {
            const img = jacket.querySelector('img');
            if (img && img.style.display === 'none') {
                // Image failed to load, use YouTube thumbnail
                img.src = `https://img.youtube.com/vi/${discoJacketMap[realKey]}/hqdefault.jpg`;
                img.style.display = '';
                placeholder.style.display = 'none';
            } else if (!img) {
                // No img at all, create one
                const newImg = document.createElement('img');
                newImg.src = `https://img.youtube.com/vi/${discoJacketMap[realKey]}/hqdefault.jpg`;
                newImg.alt = `${realKey} Single`;
                newImg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                jacket.insertBefore(newImg, placeholder);
                placeholder.style.display = 'none';
            }
        }
    }
});

const discoTrack = document.getElementById('disco-track');
const discoPrev = document.getElementById('disco-prev');
const discoNext = document.getElementById('disco-next');
const discoDots = document.getElementById('disco-dots');
const slides = document.querySelectorAll('.disco-slide');
let currentSlide = 0;

slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = `disco-dot${i === 0 ? ' active' : ''}`;
    dot.addEventListener('click', () => goToSlide(i));
    discoDots?.appendChild(dot);
});

function goToSlide(index) {
    currentSlide = Math.max(0, Math.min(index, slides.length - 1));
    if (discoTrack) discoTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
    document.querySelectorAll('.disco-dot').forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
}

discoPrev?.addEventListener('click', () => goToSlide(currentSlide - 1));
discoNext?.addEventListener('click', () => goToSlide(currentSlide + 1));

let touchStartX = 0;
discoTrack?.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
discoTrack?.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? goToSlide(currentSlide + 1) : goToSlide(currentSlide - 1);
});

// ==================== COUNTDOWN TIMER ====================
function updateCountdown() {
    const target = new Date('2026-06-20T10:00:00+09:00');
    const now = new Date();
    const diff = target - now;
    if (diff <= 0) return;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2, '0'); };
    set('cd-days', days); set('cd-hours', hours); set('cd-mins', mins); set('cd-secs', secs);
}
updateCountdown();
setInterval(updateCountdown, 1000);

// ==================== YOUTUBE MUSIC PLAYER ====================
// embed iframe のみで再生（隠しプレーヤー廃止 → 二重再生を解消）
let musicBeat = 0;
let isMusicPlaying = false;
let currentSongId = null; // 現在再生中の曲ID
let currentSongTheme = null; // 現在の曲のビジュアルテーマ

// ==================== 曲ごとのビジュアルテーマ ====================
// 各曲に固有のカラーパレット・BPM・エフェクト強度を設定
const songThemes = {
    '_cf4UTe1qrY': { // 19th ラブソングに襲われる
        name: 'lovesong', bpm: 172, intensity: 1.3,
        primary: [1.0, 0.15, 0.45], secondary: [1.0, 0.5, 0.75], accent: [1.0, 0.85, 0.3],
        mood: 'passionate', laserSpeed: 1.6, strobeChance: 0.45,
        shaderTint: [1.0, 0.25, 0.5], cameraShake: 0.014,
    },
    'F3P8vcZkIh4': { // 18th とくべチュ、して
        name: 'tokubetsu', bpm: 132, intensity: 1.0,
        primary: [1.0, 0.55, 0.75], secondary: [0.95, 0.35, 0.65], accent: [1.0, 0.9, 0.95],
        mood: 'sweet', laserSpeed: 0.8, strobeChance: 0.15,
        shaderTint: [1.0, 0.5, 0.7], cameraShake: 0.005,
    },
    '17NBPoc78oM': { // 17th 絶対アイドル辞めないで
        name: 'zettai', bpm: 178, intensity: 1.5,
        primary: [1.0, 0.0, 0.35], secondary: [1.0, 0.75, 0.0], accent: [0.0, 1.0, 1.0],
        mood: 'explosive', laserSpeed: 2.2, strobeChance: 0.6,
        shaderTint: [1.0, 0.1, 0.4], cameraShake: 0.022,
    },
    'cyRZGtNx_a4': { // 16th 呪って呪って
        name: 'norotte', bpm: 142, intensity: 1.3,
        primary: [0.55, 0.0, 0.3], secondary: [0.2, 0.0, 0.5], accent: [1.0, 0.0, 0.0],
        mood: 'dark', laserSpeed: 1.8, strobeChance: 0.5,
        shaderTint: [0.5, 0.05, 0.3], cameraShake: 0.016,
    },
    'C8WMX7dEH7Y': { // 15th ラストノートしか知らない
        name: 'lastnote', bpm: 76, intensity: 0.8,
        primary: [0.3, 0.5, 1.0], secondary: [0.7, 0.8, 1.0], accent: [1.0, 1.0, 1.0],
        mood: 'emotional', laserSpeed: 0.5, strobeChance: 0.05,
        shaderTint: [0.4, 0.55, 1.0], cameraShake: 0.003,
    },
    'Y1Bboo5KXL4': { // 14th ナツマトペ
        name: 'natsumatope', bpm: 158, intensity: 1.4,
        primary: [1.0, 0.55, 0.0], secondary: [0.0, 0.85, 1.0], accent: [1.0, 1.0, 0.2],
        mood: 'energetic', laserSpeed: 1.7, strobeChance: 0.5,
        shaderTint: [1.0, 0.6, 0.1], cameraShake: 0.019,
    },
    '20QJax8CwQo': { // 13th この空がトリガー
        name: 'trigger', bpm: 168, intensity: 1.35,
        primary: [0.0, 0.65, 1.0], secondary: [1.0, 0.3, 0.6], accent: [1.0, 0.95, 0.4],
        mood: 'dramatic', laserSpeed: 1.5, strobeChance: 0.4,
        shaderTint: [0.15, 0.55, 1.0], cameraShake: 0.015,
    },
    'suf7S4AKdmY': { // 12th Be Selfish
        name: 'selfish', bpm: 152, intensity: 1.4,
        primary: [0.1, 0.0, 0.1], secondary: [1.0, 0.0, 0.3], accent: [1.0, 1.0, 1.0],
        mood: 'intense', laserSpeed: 2.0, strobeChance: 0.55,
        shaderTint: [0.8, 0.1, 0.35], cameraShake: 0.02,
    },
    'skgh3juWdFU': { // 9th ウィークエンドシトロン
        name: 'citron', bpm: 125, intensity: 1.05,
        primary: [1.0, 0.9, 0.2], secondary: [0.3, 0.9, 0.5], accent: [1.0, 0.5, 0.7],
        mood: 'cheerful', laserSpeed: 1.0, strobeChance: 0.2,
        shaderTint: [1.0, 0.85, 0.3], cameraShake: 0.006,
    },
    'J5eTB_0SEeg': { // 6th ズルいよ ズルいね
        name: 'zurui', bpm: 84, intensity: 0.85,
        primary: [1.0, 0.4, 0.6], secondary: [0.9, 0.55, 1.0], accent: [1.0, 0.8, 0.9],
        mood: 'sweet', laserSpeed: 0.6, strobeChance: 0.08,
        shaderTint: [1.0, 0.45, 0.65], cameraShake: 0.003,
    },
    'Mq_wPiAJO7Q': { // 5th 探せ ダイヤモンドリリー
        name: 'diamond', bpm: 146, intensity: 1.15,
        primary: [0.8, 0.9, 1.0], secondary: [1.0, 0.85, 0.4], accent: [0.6, 1.0, 0.8],
        mood: 'sparkling', laserSpeed: 1.1, strobeChance: 0.3,
        shaderTint: [0.75, 0.85, 1.0], cameraShake: 0.009,
    },
    'Bot92Nn-ozk': { // 4th Want you! Want you!
        name: 'wantyou', bpm: 162, intensity: 1.35,
        primary: [1.0, 0.1, 0.55], secondary: [1.0, 0.45, 0.2], accent: [0.9, 0.0, 1.0],
        mood: 'energetic', laserSpeed: 1.8, strobeChance: 0.5,
        shaderTint: [1.0, 0.2, 0.55], cameraShake: 0.017,
    },
    'ShbfYtAPXuI': { // 11th あの子コンプレックス
        name: 'anoko', bpm: 140, intensity: 1.2,
        primary: [0.85, 0.85, 0.95], secondary: [0.6, 0.5, 0.9], accent: [1.0, 0.7, 0.85],
        mood: 'dramatic', laserSpeed: 1.3, strobeChance: 0.35,
        shaderTint: [0.8, 0.75, 0.95], cameraShake: 0.012,
    },
    'Q1-yYjZqk7o': { // 10th The 5th
        name: 'the5th', bpm: 148, intensity: 1.25,
        primary: [0.0, 0.5, 1.0], secondary: [0.2, 0.8, 0.9], accent: [1.0, 1.0, 0.6],
        mood: 'energetic', laserSpeed: 1.4, strobeChance: 0.4,
        shaderTint: [0.1, 0.55, 1.0], cameraShake: 0.013,
    },
    '8id6i_QeNJM': { // 8th 青春"サブリミナル"
        name: 'seishun', bpm: 156, intensity: 1.3,
        primary: [0.2, 0.7, 1.0], secondary: [1.0, 0.9, 0.6], accent: [0.4, 0.95, 0.85],
        mood: 'passionate', laserSpeed: 1.5, strobeChance: 0.4,
        shaderTint: [0.25, 0.65, 1.0], cameraShake: 0.014,
    },
    'iEYwHScdJFQ': { // 7th CAMEO
        name: 'cameo', bpm: 170, intensity: 1.45,
        primary: [1.0, 0.2, 0.1], secondary: [0.9, 0.7, 0.1], accent: [1.0, 0.0, 0.5],
        mood: 'intense', laserSpeed: 2.0, strobeChance: 0.55,
        shaderTint: [1.0, 0.25, 0.15], cameraShake: 0.02,
    },
    'w0N0TiOlAY0': { // 3rd 手遅れcaution
        name: 'teokure', bpm: 138, intensity: 1.1,
        primary: [1.0, 0.6, 0.2], secondary: [1.0, 0.3, 0.4], accent: [1.0, 0.9, 0.5],
        mood: 'dramatic', laserSpeed: 1.2, strobeChance: 0.3,
        shaderTint: [1.0, 0.55, 0.25], cameraShake: 0.01,
    },
    'YIjPbF-dKQA': { // 2nd 僕らの制服クリスマス
        name: 'seifuku', bpm: 120, intensity: 0.9,
        primary: [0.0, 0.6, 0.3], secondary: [1.0, 0.1, 0.2], accent: [1.0, 1.0, 1.0],
        mood: 'sweet', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [0.2, 0.65, 0.35], cameraShake: 0.004,
    },
    'xOAaBsPaPpY': { // 1st =LOVE
        name: 'equallove', bpm: 134, intensity: 1.0,
        primary: [1.0, 0.3, 0.5], secondary: [0.5, 0.2, 0.9], accent: [1.0, 0.8, 0.4],
        mood: 'normal', laserSpeed: 1.0, strobeChance: 0.25,
        shaderTint: [1.0, 0.35, 0.55], cameraShake: 0.008,
    },
    // ===== カップリング・配信・ソロ・コラボ・特別映像 =====
    '1Cy9oaBAxns': { // 内緒バナシ (配信)
        name: 'naishobanashi', bpm: 126, intensity: 0.95,
        primary: [0.9, 0.4, 0.7], secondary: [0.7, 0.3, 0.85], accent: [1.0, 0.7, 0.9],
        mood: 'sweet', laserSpeed: 0.8, strobeChance: 0.15,
        shaderTint: [0.85, 0.4, 0.7], cameraShake: 0.005,
    },
    'p-jc9qMpBb4': { // 恋人以上、好き未満 (18th 両A面)
        name: 'koibitoijou', bpm: 118, intensity: 0.9,
        primary: [1.0, 0.6, 0.7], secondary: [0.95, 0.4, 0.55], accent: [1.0, 0.85, 0.8],
        mood: 'sweet', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [1.0, 0.55, 0.65], cameraShake: 0.004,
    },
    'Jsz-Hzb4fyY': { // 好きって、言えなかった (12th c/w)
        name: 'sukitte', bpm: 80, intensity: 0.75,
        primary: [0.6, 0.7, 1.0], secondary: [0.85, 0.75, 1.0], accent: [1.0, 0.9, 1.0],
        mood: 'emotional', laserSpeed: 0.4, strobeChance: 0.05,
        shaderTint: [0.65, 0.7, 1.0], cameraShake: 0.003,
    },
    'juImxVpogRY': { // 君と私の歌 (7th c/w)
        name: 'kimitowatashi', bpm: 88, intensity: 0.8,
        primary: [1.0, 0.8, 0.5], secondary: [1.0, 0.6, 0.7], accent: [1.0, 0.95, 0.8],
        mood: 'emotional', laserSpeed: 0.5, strobeChance: 0.05,
        shaderTint: [1.0, 0.75, 0.55], cameraShake: 0.003,
    },
    'E8OqOUTLesg': { // 推しのいる世界 (6th c/w)
        name: 'oshinoiru', bpm: 136, intensity: 1.1,
        primary: [1.0, 0.5, 0.3], secondary: [1.0, 0.8, 0.4], accent: [1.0, 0.95, 0.6],
        mood: 'cheerful', laserSpeed: 1.0, strobeChance: 0.2,
        shaderTint: [1.0, 0.55, 0.35], cameraShake: 0.007,
    },
    '3qUaLsDj__M': { // おかえり、花便り (山本杏奈ソロ)
        name: 'okaeri', bpm: 78, intensity: 0.7,
        primary: [1.0, 0.75, 0.85], secondary: [0.85, 0.6, 0.75], accent: [1.0, 0.9, 0.95],
        mood: 'emotional', laserSpeed: 0.4, strobeChance: 0.03,
        shaderTint: [1.0, 0.7, 0.8], cameraShake: 0.002,
    },
    'mxKcIpKgwP0': { // 宝物はグリーン (諸橋沙夏ソロ)
        name: 'takaramono', bpm: 116, intensity: 0.85,
        primary: [0.3, 0.9, 0.5], secondary: [0.5, 1.0, 0.7], accent: [0.8, 1.0, 0.4],
        mood: 'cheerful', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [0.35, 0.85, 0.5], cameraShake: 0.004,
    },
    'aC4CdVDFzB4': { // 次に会えた時 何を話そうかな (=LOVE/≠ME合同)
        name: 'tsugini', bpm: 128, intensity: 1.0,
        primary: [0.7, 0.5, 1.0], secondary: [1.0, 0.6, 0.8], accent: [0.9, 0.8, 1.0],
        mood: 'sweet', laserSpeed: 0.9, strobeChance: 0.15,
        shaderTint: [0.75, 0.55, 1.0], cameraShake: 0.006,
    },
    'gkabNNfTjX4': { // トリプルデート (イコノイジョイ)
        name: 'tripledate', bpm: 148, intensity: 1.25,
        primary: [1.0, 0.45, 0.1], secondary: [1.0, 0.7, 0.3], accent: [1.0, 0.95, 0.5],
        mood: 'energetic', laserSpeed: 1.3, strobeChance: 0.35,
        shaderTint: [1.0, 0.5, 0.15], cameraShake: 0.012,
    },
    'FdfipkGBLd0': { // あの子コンプレックス THE FIRST TAKE
        name: 'anoko_tft', bpm: 140, intensity: 0.9,
        primary: [1.0, 1.0, 1.0], secondary: [0.85, 0.85, 0.9], accent: [1.0, 0.7, 0.85],
        mood: 'dramatic', laserSpeed: 0.8, strobeChance: 0.1,
        shaderTint: [0.95, 0.9, 0.95], cameraShake: 0.006,
    },
    '90ghDaXOygs': { // 絶対アイドル辞めないで THE FIRST TAKE
        name: 'zettai_tft', bpm: 178, intensity: 1.2,
        primary: [1.0, 1.0, 1.0], secondary: [1.0, 0.85, 0.9], accent: [1.0, 0.3, 0.5],
        mood: 'explosive', laserSpeed: 1.5, strobeChance: 0.35,
        shaderTint: [1.0, 0.95, 0.95], cameraShake: 0.015,
    },
    // ===== 19th カップリング =====
    'Pyts1pc0u1A': { // Queens
        name: 'queens', bpm: 150, intensity: 1.35,
        primary: [0.85, 0.6, 0.0], secondary: [1.0, 0.85, 0.3], accent: [1.0, 0.95, 0.7],
        mood: 'intense', laserSpeed: 1.6, strobeChance: 0.45,
        shaderTint: [0.9, 0.65, 0.1], cameraShake: 0.016,
    },
    '4xBmuiQNGdc': { // 木漏れ日メゾフォルテ
        name: 'komorebi', bpm: 120, intensity: 0.85,
        primary: [0.4, 0.8, 0.3], secondary: [0.7, 0.95, 0.5], accent: [1.0, 1.0, 0.7],
        mood: 'cheerful', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [0.5, 0.85, 0.4], cameraShake: 0.004,
    },
    // ===== 18th カップリング =====
    'd20dEAtbL08': { // 超特急逃走中
        name: 'chotokkyu', bpm: 168, intensity: 1.5,
        primary: [1.0, 0.3, 0.0], secondary: [1.0, 0.6, 0.1], accent: [1.0, 1.0, 0.0],
        mood: 'explosive', laserSpeed: 2.2, strobeChance: 0.6,
        shaderTint: [1.0, 0.35, 0.05], cameraShake: 0.022,
    },
    // ===== 17th カップリング =====
    'D0SfIi-0Zpo': { // 仲直りシュークリーム
        name: 'nakanaori', bpm: 130, intensity: 1.0,
        primary: [1.0, 0.85, 0.5], secondary: [1.0, 0.6, 0.7], accent: [1.0, 0.95, 0.85],
        mood: 'sweet', laserSpeed: 0.8, strobeChance: 0.12,
        shaderTint: [1.0, 0.8, 0.55], cameraShake: 0.005,
    },
    'i024yWd9oiI': { // 海とレモンティー
        name: 'umi_lemon', bpm: 108, intensity: 0.8,
        primary: [0.2, 0.7, 0.9], secondary: [1.0, 0.9, 0.3], accent: [0.5, 0.95, 0.8],
        mood: 'emotional', laserSpeed: 0.5, strobeChance: 0.06,
        shaderTint: [0.3, 0.7, 0.85], cameraShake: 0.003,
    },
    // ===== 16th カップリング =====
    'E4PVynHrfp8': { // 誰にもバレずに
        name: 'darenimo', bpm: 92, intensity: 0.85,
        primary: [0.3, 0.25, 0.5], secondary: [0.6, 0.4, 0.75], accent: [0.9, 0.7, 1.0],
        mood: 'emotional', laserSpeed: 0.5, strobeChance: 0.06,
        shaderTint: [0.4, 0.3, 0.55], cameraShake: 0.003,
    },
    'xmo-UbsUZE4': { // 君の第3ボタン
        name: 'dai3button', bpm: 124, intensity: 0.9,
        primary: [0.4, 0.7, 1.0], secondary: [0.7, 0.85, 1.0], accent: [1.0, 0.9, 0.8],
        mood: 'sweet', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [0.5, 0.7, 1.0], cameraShake: 0.004,
    },
    // ===== 15th カップリング =====
    'Y3aRUM8ebKE': { // ドライブ デート 都内
        name: 'drive_date', bpm: 116, intensity: 0.9,
        primary: [0.9, 0.5, 0.7], secondary: [1.0, 0.7, 0.8], accent: [1.0, 0.85, 0.9],
        mood: 'sweet', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [0.9, 0.55, 0.7], cameraShake: 0.004,
    },
    'RG_B3gfOzLo': { // 狂想カタストロフィ
        name: 'kyousou', bpm: 176, intensity: 1.5,
        primary: [0.6, 0.0, 0.2], secondary: [0.3, 0.0, 0.4], accent: [1.0, 0.1, 0.3],
        mood: 'dark', laserSpeed: 2.2, strobeChance: 0.6,
        shaderTint: [0.55, 0.05, 0.25], cameraShake: 0.022,
    },
    'Mdsq8dUNvrI': { // どこが好きか言って
        name: 'dokoga', bpm: 130, intensity: 1.0,
        primary: [1.0, 0.55, 0.65], secondary: [0.9, 0.4, 0.8], accent: [1.0, 0.85, 0.9],
        mood: 'sweet', laserSpeed: 0.8, strobeChance: 0.15,
        shaderTint: [1.0, 0.5, 0.65], cameraShake: 0.006,
    },
    // ===== 14th カップリング =====
    'zKkx-rtOIPo': { // だからとて
        name: 'dakaratote', bpm: 88, intensity: 0.8,
        primary: [0.4, 0.35, 0.6], secondary: [0.6, 0.5, 0.8], accent: [0.85, 0.75, 1.0],
        mood: 'emotional', laserSpeed: 0.4, strobeChance: 0.05,
        shaderTint: [0.45, 0.4, 0.65], cameraShake: 0.003,
    },
    'B2teLF9l4aI': { // ヒロインズ
        name: 'heroines', bpm: 140, intensity: 1.15,
        primary: [1.0, 0.4, 0.55], secondary: [1.0, 0.7, 0.3], accent: [1.0, 0.9, 0.6],
        mood: 'dramatic', laserSpeed: 1.2, strobeChance: 0.3,
        shaderTint: [1.0, 0.45, 0.55], cameraShake: 0.01,
    },
    'u_Y91a-uILM': { // ラブロケ
        name: 'lovrocket', bpm: 156, intensity: 1.3,
        primary: [1.0, 0.2, 0.5], secondary: [1.0, 0.5, 0.7], accent: [1.0, 0.9, 0.4],
        mood: 'energetic', laserSpeed: 1.5, strobeChance: 0.4,
        shaderTint: [1.0, 0.3, 0.5], cameraShake: 0.014,
    },
    // ===== 13th カップリング =====
    'POBlJq_P8os': { // Junkies
        name: 'junkies', bpm: 160, intensity: 1.4,
        primary: [0.2, 0.1, 0.3], secondary: [0.8, 0.2, 0.5], accent: [1.0, 0.0, 0.8],
        mood: 'intense', laserSpeed: 1.8, strobeChance: 0.5,
        shaderTint: [0.3, 0.15, 0.35], cameraShake: 0.018,
    },
    '11SXnMJKljk': { // ラブクリエイト
        name: 'lovecreate', bpm: 134, intensity: 1.1,
        primary: [1.0, 0.5, 0.6], secondary: [0.9, 0.3, 0.7], accent: [1.0, 0.8, 0.85],
        mood: 'cheerful', laserSpeed: 1.0, strobeChance: 0.2,
        shaderTint: [1.0, 0.5, 0.6], cameraShake: 0.008,
    },
    'WB30LnBxwfk': { // Kiara Tiara
        name: 'kiaratiara', bpm: 128, intensity: 1.0,
        primary: [0.8, 0.6, 1.0], secondary: [1.0, 0.7, 0.9], accent: [0.95, 0.85, 1.0],
        mood: 'sparkling', laserSpeed: 0.9, strobeChance: 0.15,
        shaderTint: [0.8, 0.65, 1.0], cameraShake: 0.006,
    },
    // ===== 12th カップリング =====
    'nqgFDf46MZI': { // わたし、魔法使い
        name: 'mahotsukai', bpm: 144, intensity: 1.2,
        primary: [0.6, 0.3, 1.0], secondary: [0.9, 0.5, 1.0], accent: [1.0, 0.8, 1.0],
        mood: 'sparkling', laserSpeed: 1.3, strobeChance: 0.3,
        shaderTint: [0.65, 0.35, 1.0], cameraShake: 0.01,
    },
    'qzFBzJ2KWwY': { // 真夜中マーメイド
        name: 'mermaid', bpm: 96, intensity: 0.85,
        primary: [0.1, 0.3, 0.7], secondary: [0.2, 0.5, 0.9], accent: [0.5, 0.8, 1.0],
        mood: 'emotional', laserSpeed: 0.5, strobeChance: 0.06,
        shaderTint: [0.15, 0.35, 0.75], cameraShake: 0.003,
    },
    // ===== 11th カップリング =====
    'LKwERkGBiog': { // 笑顔のレシピ
        name: 'egao_recipe', bpm: 126, intensity: 0.95,
        primary: [1.0, 0.8, 0.3], secondary: [1.0, 0.6, 0.5], accent: [1.0, 0.95, 0.7],
        mood: 'cheerful', laserSpeed: 0.8, strobeChance: 0.12,
        shaderTint: [1.0, 0.75, 0.35], cameraShake: 0.005,
    },
    'IplzPaWoFXo': { // 知らんけど
        name: 'shirankedo', bpm: 148, intensity: 1.2,
        primary: [1.0, 0.3, 0.2], secondary: [1.0, 0.6, 0.3], accent: [1.0, 0.9, 0.4],
        mood: 'energetic', laserSpeed: 1.3, strobeChance: 0.35,
        shaderTint: [1.0, 0.35, 0.25], cameraShake: 0.012,
    },
    'AJ1GQ-iLyEM': { // 僕のヒロイン
        name: 'boku_heroine', bpm: 82, intensity: 0.75,
        primary: [0.5, 0.6, 1.0], secondary: [0.75, 0.8, 1.0], accent: [1.0, 0.9, 1.0],
        mood: 'emotional', laserSpeed: 0.4, strobeChance: 0.05,
        shaderTint: [0.55, 0.65, 1.0], cameraShake: 0.003,
    },
    // ===== 10th カップリング =====
    'oCb89c0MDVk': { // お姫様にしてよ！
        name: 'ohimesama', bpm: 138, intensity: 1.1,
        primary: [1.0, 0.6, 0.8], secondary: [1.0, 0.4, 0.65], accent: [1.0, 0.9, 0.95],
        mood: 'sweet', laserSpeed: 0.9, strobeChance: 0.18,
        shaderTint: [1.0, 0.55, 0.75], cameraShake: 0.007,
    },
    '2l7yxbJ2Eqc': { // Poison Girl
        name: 'poisongirl', bpm: 154, intensity: 1.35,
        primary: [0.5, 0.0, 0.6], secondary: [0.8, 0.1, 0.5], accent: [1.0, 0.0, 1.0],
        mood: 'dark', laserSpeed: 1.7, strobeChance: 0.45,
        shaderTint: [0.55, 0.05, 0.6], cameraShake: 0.016,
    },
    'TCTylb6qGdw': { // BPM170の君へ
        name: 'bpm170', bpm: 170, intensity: 1.45,
        primary: [1.0, 0.1, 0.3], secondary: [1.0, 0.5, 0.2], accent: [1.0, 0.9, 0.3],
        mood: 'explosive', laserSpeed: 2.0, strobeChance: 0.55,
        shaderTint: [1.0, 0.15, 0.35], cameraShake: 0.02,
    },
    // ===== 9th カップリング =====
    'L7QUReMgJBY': { // ズッ友案件
        name: 'zuttomo', bpm: 146, intensity: 1.2,
        primary: [1.0, 0.5, 0.0], secondary: [1.0, 0.8, 0.2], accent: [1.0, 1.0, 0.5],
        mood: 'energetic', laserSpeed: 1.3, strobeChance: 0.3,
        shaderTint: [1.0, 0.55, 0.1], cameraShake: 0.011,
    },
    '8VBDO8ZQyDo': { // 夏祭り恋慕う
        name: 'natsumatsuri', bpm: 110, intensity: 0.9,
        primary: [1.0, 0.4, 0.2], secondary: [1.0, 0.7, 0.1], accent: [0.9, 0.3, 0.6],
        mood: 'emotional', laserSpeed: 0.6, strobeChance: 0.08,
        shaderTint: [1.0, 0.45, 0.25], cameraShake: 0.004,
    },
    'm8WtzVPXxwU': { // 祝祭
        name: 'shukusai', bpm: 158, intensity: 1.35,
        primary: [0.9, 0.7, 0.0], secondary: [1.0, 0.5, 0.2], accent: [1.0, 0.95, 0.4],
        mood: 'passionate', laserSpeed: 1.5, strobeChance: 0.4,
        shaderTint: [0.9, 0.7, 0.1], cameraShake: 0.014,
    },
    // ===== 8th カップリング =====
    'hTu7a1kRXYQ': { // しゅきぴ
        name: 'shukipi', bpm: 136, intensity: 1.1,
        primary: [1.0, 0.5, 0.7], secondary: [1.0, 0.3, 0.55], accent: [1.0, 0.85, 0.9],
        mood: 'cheerful', laserSpeed: 1.0, strobeChance: 0.2,
        shaderTint: [1.0, 0.5, 0.65], cameraShake: 0.008,
    },
    'FbMXfjeUXXA': { // 流星群
        name: 'ryuseigun', bpm: 78, intensity: 0.7,
        primary: [0.15, 0.2, 0.5], secondary: [0.3, 0.4, 0.8], accent: [0.7, 0.8, 1.0],
        mood: 'emotional', laserSpeed: 0.3, strobeChance: 0.03,
        shaderTint: [0.2, 0.25, 0.55], cameraShake: 0.002,
    },
    // ===== 6th カップリング =====
    'TA0oDNGCFHQ': { // Sweetest girl
        name: 'sweetestgirl', bpm: 118, intensity: 0.9,
        primary: [1.0, 0.7, 0.8], secondary: [0.95, 0.5, 0.7], accent: [1.0, 0.9, 0.95],
        mood: 'sweet', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [1.0, 0.65, 0.75], cameraShake: 0.004,
    },
    // ===== 5th カップリング =====
    'hRdSH41gjx0': { // いらない ツインテール
        name: 'twintail', bpm: 142, intensity: 1.15,
        primary: [1.0, 0.4, 0.6], secondary: [1.0, 0.65, 0.8], accent: [1.0, 0.9, 0.5],
        mood: 'cheerful', laserSpeed: 1.1, strobeChance: 0.25,
        shaderTint: [1.0, 0.45, 0.6], cameraShake: 0.009,
    },
    'qoPqgiQVhok': { // 虹の素
        name: 'nijinomoto', bpm: 86, intensity: 0.75,
        primary: [0.4, 0.7, 1.0], secondary: [0.6, 0.9, 0.8], accent: [1.0, 0.8, 0.5],
        mood: 'emotional', laserSpeed: 0.4, strobeChance: 0.05,
        shaderTint: [0.45, 0.7, 1.0], cameraShake: 0.003,
    },
    // ===== 4th カップリング =====
    'canxm5HHHQc': { // 今、この船に乗れ！
        name: 'kono_fune', bpm: 152, intensity: 1.3,
        primary: [0.0, 0.5, 1.0], secondary: [0.2, 0.7, 0.9], accent: [1.0, 0.9, 0.3],
        mood: 'energetic', laserSpeed: 1.5, strobeChance: 0.4,
        shaderTint: [0.1, 0.55, 1.0], cameraShake: 0.014,
    },
    'SrqqHpWIN9M': { // アイカツハッピーエンド
        name: 'aikatsu', bpm: 138, intensity: 1.1,
        primary: [1.0, 0.6, 0.2], secondary: [1.0, 0.8, 0.4], accent: [1.0, 0.95, 0.6],
        mood: 'cheerful', laserSpeed: 1.0, strobeChance: 0.2,
        shaderTint: [1.0, 0.65, 0.25], cameraShake: 0.008,
    },
    // ===== 3rd カップリング =====
    'vJIPN_iZnIU': { // 部活中に目が合うなって思ってたんだ
        name: 'bukatsu', bpm: 128, intensity: 0.95,
        primary: [0.3, 0.8, 0.5], secondary: [0.5, 0.9, 0.7], accent: [1.0, 1.0, 0.7],
        mood: 'sweet', laserSpeed: 0.8, strobeChance: 0.12,
        shaderTint: [0.35, 0.8, 0.55], cameraShake: 0.005,
    },
    'Qg9344QHJDU': { // 樹愛羅、助けに来たぞ
        name: 'kiara_tasuke', bpm: 144, intensity: 1.2,
        primary: [1.0, 0.3, 0.4], secondary: [1.0, 0.55, 0.6], accent: [1.0, 0.85, 0.5],
        mood: 'dramatic', laserSpeed: 1.3, strobeChance: 0.3,
        shaderTint: [1.0, 0.35, 0.45], cameraShake: 0.01,
    },
    // ===== 2nd カップリング =====
    'RxcNhst20uw': { // 届いてLOVE YOU♡
        name: 'todoke_love', bpm: 120, intensity: 0.9,
        primary: [1.0, 0.5, 0.65], secondary: [1.0, 0.7, 0.8], accent: [1.0, 0.9, 0.95],
        mood: 'sweet', laserSpeed: 0.7, strobeChance: 0.1,
        shaderTint: [1.0, 0.55, 0.65], cameraShake: 0.004,
    },
    'z858cLcnaJo': { // ようこそ！イコラブ沼
        name: 'icolove_numa', bpm: 136, intensity: 1.1,
        primary: [1.0, 0.4, 0.55], secondary: [0.9, 0.3, 0.7], accent: [1.0, 0.8, 0.4],
        mood: 'cheerful', laserSpeed: 1.0, strobeChance: 0.2,
        shaderTint: [1.0, 0.45, 0.55], cameraShake: 0.007,
    },
    // ===== アルバム曲 =====
    '0ImFNEs7P_Q': { // 桜の咲く音がした
        name: 'sakura_oto', bpm: 84, intensity: 0.75,
        primary: [1.0, 0.7, 0.8], secondary: [1.0, 0.85, 0.9], accent: [1.0, 0.95, 0.95],
        mood: 'emotional', laserSpeed: 0.4, strobeChance: 0.04,
        shaderTint: [1.0, 0.75, 0.8], cameraShake: 0.002,
    },
    // ===== ソロ曲 =====
    'PFBhWKdjBTQ': { // 拝啓 貴方様 (野口衣織ソロ)
        name: 'haikei', bpm: 76, intensity: 0.7,
        primary: [0.3, 0.4, 0.6], secondary: [0.5, 0.6, 0.8], accent: [0.8, 0.85, 1.0],
        mood: 'emotional', laserSpeed: 0.3, strobeChance: 0.03,
        shaderTint: [0.35, 0.45, 0.65], cameraShake: 0.002,
    },
    'j0m03h8KD2U': { // 現役アイドルちゅ〜 (齊藤なぎさソロ)
        name: 'geneki', bpm: 152, intensity: 1.3,
        primary: [1.0, 0.3, 0.5], secondary: [1.0, 0.6, 0.7], accent: [1.0, 0.9, 0.4],
        mood: 'energetic', laserSpeed: 1.4, strobeChance: 0.35,
        shaderTint: [1.0, 0.35, 0.5], cameraShake: 0.013,
    },
};
// デフォルトテーマ
const defaultTheme = {
    name: 'default', bpm: 130, intensity: 1.0,
    primary: [1.0, 0.4, 0.6], secondary: [0.5, 0.3, 1.0], accent: [1.0, 0.85, 0.3],
    mood: 'normal', laserSpeed: 1.0, strobeChance: 0.3,
    shaderTint: [1.0, 0.4, 0.6], cameraShake: 0.008,
};

// MV list with YouTube video IDs (新しい順 → 19th～1st 全シングル順番通り)
const mvList = [
    { id: '_cf4UTe1qrY', title: 'ラブソングに襲われる', single: '19th Single', year: '2025', type: 'single' },
    { id: 'F3P8vcZkIh4', title: 'とくべチュ、して', single: '18th Single', year: '2025', type: 'single' },
    { id: '17NBPoc78oM', title: '絶対アイドル辞めないで', single: '17th Single', year: '2024', type: 'single' },
    { id: 'cyRZGtNx_a4', title: '呪って呪って', single: '16th Single', year: '2024', type: 'single' },
    { id: 'C8WMX7dEH7Y', title: 'ラストノートしか知らない', single: '15th Single', year: '2023', type: 'single' },
    { id: 'Y1Bboo5KXL4', title: 'ナツマトペ', single: '14th Single', year: '2023', type: 'single' },
    { id: '20QJax8CwQo', title: 'この空がトリガー', single: '13th Single', year: '2023', type: 'single' },
    { id: 'suf7S4AKdmY', title: 'Be Selfish', single: '12th Single', year: '2022', type: 'single' },
    { id: 'ShbfYtAPXuI', title: 'あの子コンプレックス', single: '11th Single', year: '2022', type: 'single' },
    { id: 'Q1-yYjZqk7o', title: 'The 5th', single: '10th Single', year: '2021', type: 'single' },
    { id: 'skgh3juWdFU', title: 'ウィークエンドシトロン', single: '9th Single', year: '2021', type: 'single' },
    { id: '8id6i_QeNJM', title: '青春"サブリミナル"', single: '8th Single', year: '2020', type: 'single' },
    { id: 'iEYwHScdJFQ', title: 'CAMEO', single: '7th Single', year: '2020', type: 'single' },
    { id: 'J5eTB_0SEeg', title: 'ズルいよ ズルいね', single: '6th Single', year: '2019', type: 'single' },
    { id: 'Mq_wPiAJO7Q', title: '探せ ダイヤモンドリリー', single: '5th Single', year: '2019', type: 'single' },
    { id: 'Bot92Nn-ozk', title: 'Want you! Want you!', single: '4th Single', year: '2018', type: 'single' },
    { id: 'w0N0TiOlAY0', title: '手遅れcaution', single: '3rd Single', year: '2018', type: 'single' },
    { id: 'YIjPbF-dKQA', title: '僕らの制服クリスマス', single: '2nd Single', year: '2017', type: 'single' },
    { id: 'xOAaBsPaPpY', title: '=LOVE', single: '1st Single', year: '2017', type: 'single' },
];

// カップリング曲・配信曲・ソロ曲・特別映像など
const extraMvList = [
    // ─── 配信シングル ───
    { id: '1Cy9oaBAxns', title: '内緒バナシ', single: '配信限定', year: '2025', type: 'digital' },
    // ─── 19th カップリング ───
    { id: 'Pyts1pc0u1A', title: 'Queens', single: '19th c/w', year: '2025', type: 'coupling' },
    { id: '4xBmuiQNGdc', title: '木漏れ日メゾフォルテ', single: '19th c/w', year: '2025', type: 'coupling' },
    // ─── 18th カップリング ───
    { id: 'p-jc9qMpBb4', title: '恋人以上、好き未満', single: '18th 両A面', year: '2025', type: 'coupling' },
    { id: 'd20dEAtbL08', title: '超特急逃走中', single: '18th c/w', year: '2025', type: 'coupling' },
    // ─── 17th カップリング ───
    { id: 'D0SfIi-0Zpo', title: '仲直りシュークリーム', single: '17th c/w', year: '2024', type: 'coupling' },
    { id: 'i024yWd9oiI', title: '海とレモンティー', single: '17th c/w', year: '2024', type: 'coupling' },
    // ─── 16th カップリング ───
    { id: 'E4PVynHrfp8', title: '誰にもバレずに', single: '16th c/w', year: '2024', type: 'coupling' },
    { id: 'xmo-UbsUZE4', title: '君の第3ボタン', single: '16th c/w', year: '2024', type: 'coupling' },
    // ─── 15th カップリング ───
    { id: 'Y3aRUM8ebKE', title: 'ドライブ デート 都内', single: '15th c/w', year: '2023', type: 'coupling' },
    { id: 'RG_B3gfOzLo', title: '狂想カタストロフィ', single: '15th c/w', year: '2023', type: 'coupling' },
    { id: 'Mdsq8dUNvrI', title: 'どこが好きか言って', single: '15th c/w', year: '2023', type: 'coupling' },
    // ─── 14th カップリング ───
    { id: 'zKkx-rtOIPo', title: 'だからとて', single: '14th c/w', year: '2023', type: 'coupling' },
    { id: 'B2teLF9l4aI', title: 'ヒロインズ', single: '14th c/w', year: '2023', type: 'coupling' },
    { id: 'u_Y91a-uILM', title: 'ラブロケ', single: '14th c/w', year: '2023', type: 'coupling' },
    // ─── 13th カップリング ───
    { id: 'POBlJq_P8os', title: 'Junkies', single: '13th c/w', year: '2023', type: 'coupling' },
    { id: '11SXnMJKljk', title: 'ラブクリエイト', single: '13th c/w', year: '2023', type: 'coupling' },
    { id: 'WB30LnBxwfk', title: 'Kiara Tiara', single: '13th c/w', year: '2023', type: 'coupling' },
    // ─── 12th カップリング ───
    { id: 'Jsz-Hzb4fyY', title: '好きって、言えなかった', single: '12th c/w', year: '2022', type: 'coupling' },
    { id: 'nqgFDf46MZI', title: 'わたし、魔法使い', single: '12th c/w', year: '2022', type: 'coupling' },
    { id: 'qzFBzJ2KWwY', title: '真夜中マーメイド', single: '12th c/w', year: '2022', type: 'coupling' },
    // ─── 11th カップリング ───
    { id: 'LKwERkGBiog', title: '笑顔のレシピ', single: '11th c/w', year: '2022', type: 'coupling' },
    { id: 'IplzPaWoFXo', title: '知らんけど', single: '11th c/w', year: '2022', type: 'coupling' },
    { id: 'AJ1GQ-iLyEM', title: '僕のヒロイン', single: '11th c/w', year: '2022', type: 'coupling' },
    // ─── 10th カップリング ───
    { id: 'oCb89c0MDVk', title: 'お姫様にしてよ！', single: '10th c/w', year: '2021', type: 'coupling' },
    { id: '2l7yxbJ2Eqc', title: 'Poison Girl', single: '10th c/w', year: '2021', type: 'coupling' },
    { id: 'TCTylb6qGdw', title: 'BPM170の君へ', single: '10th c/w', year: '2021', type: 'coupling' },
    // ─── 9th カップリング ───
    { id: 'L7QUReMgJBY', title: 'ズッ友案件', single: '9th c/w', year: '2021', type: 'coupling' },
    { id: '8VBDO8ZQyDo', title: '夏祭り恋慕う', single: '9th c/w', year: '2021', type: 'coupling' },
    { id: 'm8WtzVPXxwU', title: '祝祭', single: '9th c/w', year: '2021', type: 'coupling' },
    // ─── 8th カップリング ───
    { id: 'hTu7a1kRXYQ', title: 'しゅきぴ', single: '8th c/w', year: '2020', type: 'coupling' },
    { id: 'FbMXfjeUXXA', title: '流星群', single: '8th c/w', year: '2020', type: 'coupling' },
    // ─── 7th カップリング ───
    { id: 'juImxVpogRY', title: '君と私の歌', single: '7th c/w', year: '2020', type: 'coupling' },
    // ─── 6th カップリング ───
    { id: 'E8OqOUTLesg', title: '推しのいる世界', single: '6th c/w', year: '2019', type: 'coupling' },
    { id: 'TA0oDNGCFHQ', title: 'Sweetest girl', single: '6th c/w', year: '2019', type: 'coupling' },
    // ─── 5th カップリング ───
    { id: 'hRdSH41gjx0', title: 'いらない ツインテール', single: '5th c/w', year: '2019', type: 'coupling' },
    { id: 'qoPqgiQVhok', title: '虹の素', single: '5th c/w', year: '2019', type: 'coupling' },
    // ─── 4th カップリング ───
    { id: 'canxm5HHHQc', title: '今、この船に乗れ！', single: '4th c/w', year: '2018', type: 'coupling' },
    { id: 'SrqqHpWIN9M', title: 'アイカツハッピーエンド', single: '4th c/w', year: '2018', type: 'coupling' },
    // ─── 3rd カップリング ───
    { id: 'vJIPN_iZnIU', title: '部活中に目が合うなって思ってたんだ', single: '3rd c/w', year: '2018', type: 'coupling' },
    { id: 'Qg9344QHJDU', title: '樹愛羅、助けに来たぞ', single: '3rd c/w', year: '2018', type: 'coupling' },
    // ─── 2nd カップリング ───
    { id: 'RxcNhst20uw', title: '届いてLOVE YOU♡', single: '2nd c/w', year: '2017', type: 'coupling' },
    { id: 'z858cLcnaJo', title: 'ようこそ！イコラブ沼', single: '2nd c/w', year: '2017', type: 'coupling' },
    // ─── アルバム曲 ───
    { id: '0ImFNEs7P_Q', title: '桜の咲く音がした', single: '1st Album', year: '2023', type: 'coupling' },
    // ─── ソロ曲 ───
    { id: 'PFBhWKdjBTQ', title: '拝啓 貴方様', single: '野口衣織 ソロ', year: '2023', type: 'solo' },
    { id: 'j0m03h8KD2U', title: '現役アイドルちゅ〜', single: '齊藤なぎさ ソロ', year: '2023', type: 'solo' },
    { id: '3qUaLsDj__M', title: 'おかえり、花便り', single: '山本杏奈 ソロ', year: '2024', type: 'solo' },
    { id: 'mxKcIpKgwP0', title: '宝物はグリーン', single: '諸橋沙夏 ソロ', year: '2024', type: 'solo' },
    // ─── コラボ ───
    { id: 'aC4CdVDFzB4', title: '次に会えた時 何を話そうかな', single: '=LOVE / ≠ME', year: '2022', type: 'collab' },
    { id: 'gkabNNfTjX4', title: 'トリプルデート', single: 'イコノイジョイ', year: '2023', type: 'collab' },
    // ─── 特別映像 ───
    { id: 'FdfipkGBLd0', title: 'あの子コンプレックス', single: 'THE FIRST TAKE', year: '2023', type: 'special' },
    { id: '90ghDaXOygs', title: '絶対アイドル辞めないで', single: 'THE FIRST TAKE', year: '2024', type: 'special' },
];

// Build MV cards in the DOM
const musicGrid = document.getElementById('music-grid');

// タイプ別のタグ色設定
const typeTagStyles = {
    single: '', // デフォルト（ピンク）
    coupling: 'background:rgba(100,200,255,0.12);border-color:rgba(100,200,255,0.25);color:#64c8ff;',
    digital: 'background:rgba(0,230,180,0.12);border-color:rgba(0,230,180,0.25);color:#00e6b4;',
    solo: 'background:rgba(255,200,50,0.12);border-color:rgba(255,200,50,0.25);color:#ffc832;',
    collab: 'background:rgba(200,140,255,0.12);border-color:rgba(200,140,255,0.25);color:#c88cff;',
    special: 'background:rgba(255,80,80,0.12);border-color:rgba(255,80,80,0.25);color:#ff5050;',
};

function buildMvCard(mv, i, isNew) {
    const card = document.createElement('div');
    card.className = 'music-card';
    card.dataset.videoId = mv.id;
    card.dataset.delay = (i * 80).toString();
    const tagStyle = typeTagStyles[mv.type] || '';
    card.innerHTML = `
        <div class="music-thumb">
            <img src="https://img.youtube.com/vi/${mv.id}/hqdefault.jpg" alt="${mv.title}" loading="lazy">
            <div class="music-play-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
            ${isNew ? '<div class="music-new-badge">NEW</div>' : ''}
        </div>
        <div class="music-info-text">
            <h4>${mv.title}</h4>
            <p><span class="music-single-tag" style="${tagStyle}">${mv.single}</span> ${mv.year}</p>
        </div>
    `;
    card.addEventListener('click', () => playMV(mv.id, mv.title));
    return card;
}

if (musicGrid) {
    // シングル表題曲
    mvList.forEach((mv, i) => {
        musicGrid.appendChild(buildMvCard(mv, i, i < 2));
    });

    // セパレーター: カップリング・その他
    const separator = document.createElement('div');
    separator.className = 'music-section-divider';
    separator.innerHTML = `<span class="divider-line"></span><span class="divider-label">カップリング / ソロ / 特別映像</span><span class="divider-line"></span>`;
    musicGrid.parentNode.insertBefore(separator, musicGrid.nextSibling);

    // エクストラMVグリッド
    const extraGrid = document.createElement('div');
    extraGrid.id = 'music-grid-extra';
    extraGrid.className = 'music-grid';
    separator.parentNode.insertBefore(extraGrid, separator.nextSibling);

    // 遅延読み込み: 最初に12曲だけ表示、残りは「もっと見る」で
    const EXTRA_INITIAL = 12;
    let extraShowCount = 0;

    function showMoreExtras() {
        const start = extraShowCount;
        const end = Math.min(extraShowCount + EXTRA_INITIAL, extraMvList.length);
        for (let i = start; i < end; i++) {
            extraGrid.appendChild(buildMvCard(extraMvList[i], mvList.length + i, false));
        }
        extraShowCount = end;
        // もっと見るボタン更新
        const existBtn = document.getElementById('show-more-extras');
        if (extraShowCount >= extraMvList.length) {
            existBtn?.remove();
        } else if (!existBtn) {
            const moreBtn = document.createElement('button');
            moreBtn.id = 'show-more-extras';
            moreBtn.className = 'btn-show-more';
            moreBtn.innerHTML = `もっと見る <small>(残り${extraMvList.length - extraShowCount}曲)</small>`;
            moreBtn.addEventListener('click', () => {
                showMoreExtras();
                // ボタンテキスト更新
                if (extraShowCount < extraMvList.length) {
                    moreBtn.innerHTML = `もっと見る <small>(残り${extraMvList.length - extraShowCount}曲)</small>`;
                }
                // 新しく追加されたカードのアニメーション
                setTimeout(revealElements, 100);
            });
            extraGrid.parentNode.insertBefore(moreBtn, extraGrid.nextSibling);
        } else {
            existBtn.innerHTML = `もっと見る <small>(残り${extraMvList.length - extraShowCount}曲)</small>`;
        }
    }

    showMoreExtras(); // 最初の12曲表示
}

// ★ 探索モード用ミニ曲セレクター構築
setTimeout(() => {
    const songListEl = document.getElementById('explore-song-list');
    if (songListEl) {
        const allSongs = [...mvList, ...extraMvList];
        allSongs.forEach(mv => {
            const btn = document.createElement('button');
            btn.className = 'explore-song-btn';
            btn.textContent = mv.title;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 選択中のボタンをハイライト
                songListEl.querySelectorAll('.explore-song-btn').forEach(b => b.classList.remove('playing'));
                btn.classList.add('playing');
                playMV(mv.id, mv.title);
            });
            songListEl.appendChild(btn);
        });
    }
}, 100);

// ==================== playMV — embed iframe のみ（二重再生なし）====================
function playMV(videoId, title) {
    currentSongId = videoId;
    currentSongTheme = songThemes[videoId] || defaultTheme;

    // NOW PLAYING 表示を更新
    const nowEl = document.getElementById('now-playing-title');
    if (nowEl) nowEl.textContent = title;
    document.getElementById('music-now-playing')?.classList.add('active');
    isMusicPlaying = true;
    startFakeAnalyser();

    // 曲のテーマカラーで背景にフラッシュ演出
    createSongTransitionFlash(currentSongTheme);

    // ★ サムネイルをサブスクリーンに表示（GLBスクリーン含む全画面即時更新）
    // screenPhotosに含まれない曲（カップリング等）も対応するため、直接videoIdからサムネイルを取得
    const photoIdx = screenPhotos.indexOf(videoId);
    if (photoIdx >= 0) {
        currentPhotoIndex = photoIdx;
    }
    lastPhotoChange = Infinity; // 自動切替を一時停止

    // 全曲対応：YouTubeサムネイルを直接読み込んでGLBスクリーンに反映
    const songThumbLoader = new THREE.TextureLoader();
    songThumbLoader.load(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, (tex) => {
        if (tex) {
            // サブスクリーン
            subScreens.forEach(ss => {
                ss.material.map = tex;
                ss.material.color.set(0xffffff);
                ss.material.needsUpdate = true;
            });
            // ★ GLBフロントスクリーン即時更新
            glbFrontScreens.forEach(fs => {
                const fsTex = tex.clone();
                fsTex.flipY = false;
                fsTex.needsUpdate = true;
                if (fs.material.map) fs.material.map.dispose();
                fs.material.map = fsTex;
                fs.material.needsUpdate = true;
            });
            // ★ GLB天井スクリーン即時更新
            glbCeilingScreens.forEach(cs => {
                const csTex = tex.clone();
                csTex.flipY = false;
                csTex.needsUpdate = true;
                if (cs.material.map) cs.material.map.dispose();
                cs.material.map = csTex;
                cs.material.needsUpdate = true;
            });
            // ★ GLBバックスクリーン即時更新
            if (glbBackScreen) {
                const glbTex = tex.clone();
                glbTex.flipY = false;
                glbTex.needsUpdate = true;
                if (glbBackScreen.material.map) glbBackScreen.material.map.dispose();
                glbBackScreen.material.map = glbTex;
                glbBackScreen.material.needsUpdate = true;
            }
            // ★ GLBペンライトの色を曲テーマに合わせる
            if (currentSongTheme && glbStickLights.length > 0) {
                const p = currentSongTheme.primary;
                const themeColor = new THREE.Color(p[0], p[1], p[2]);
                glbStickLights.forEach(sl => {
                    sl.material.color.copy(themeColor);
                    sl.material.needsUpdate = true;
                });
            }
            // ★ バックスクリーンにもテクスチャ反映
            if (backScreen) {
                backScreen.material.map = tex;
                backScreen.material.color.set(0xffffff);
                backScreen.material.opacity = 0.15;
                backScreen.material.needsUpdate = true;
            }
        }
    });

    // ★ ステージ演出を一気にMAXまでブースト
    musicBeat = 0.8;

    // ★★★ 正面HTML動画オーバーレイ（バックスクリーン位置に重ねる）★★★
    removeStageVideo();
    stageVideoShowingIframe = true;

    // YouTube IFrame Player APIが使える場合はそちらで（onStateChange取得可能）
    stageVideoContainer.innerHTML = '';
    stageVideoContainer.style.display = 'block';

    if (ytApiReady && window.YT && window.YT.Player) {
        const playerDiv = document.createElement('div');
        playerDiv.id = 'stage-video-iframe';
        stageVideoContainer.appendChild(playerDiv);
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
        ytPlayer = new YT.Player('stage-video-iframe', {
            width: '100%',
            height: '100%',
            videoId: videoId,
            playerVars: {
                autoplay: 1, mute: 1, rel: 0, modestbranding: 1, enablejsapi: 1, controls: 1,
                playsinline: 1,
                origin: window.location.origin,
            },
            events: {
                onReady: (event) => {
                    // 全環境: ミュート状態で再生開始（ブラウザポリシー対策）
                    event.target.mute();
                    event.target.playVideo();
                    // Safari対策: playVideo()が効かない場合のリトライ
                    setTimeout(() => {
                        try {
                            const state = event.target.getPlayerState();
                            if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
                                event.target.playVideo();
                            }
                        } catch(e) {}
                    }, 600);
                    // アンミュート（少し待ってから）
                    setTimeout(() => {
                        try {
                            event.target.unMute();
                            event.target.setVolume(100);
                        } catch(e) {}
                    }, 1500);
                },
                onStateChange: (event) => {
                    if (event.data === YT.PlayerState.ENDED && autoPlayEnabled && isMusicPlaying) {
                        if (autoPlayTimer) clearTimeout(autoPlayTimer);
                        autoPlayTimer = setTimeout(() => playNextSong(), 1500);
                    }
                },
            },
        });
        // YT.Player creates an iframe — grab it
        setTimeout(() => {
            const iframe = document.getElementById('stage-video-iframe');
            if (iframe) {
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                iframe.setAttribute('allowfullscreen', '');
                // 初期位置: 画面上部中央に配置（updateStageVideoOverlayで毎フレーム更新される）
                const iW = Math.min(window.innerWidth * 0.52, window.innerHeight * 0.32 * 16 / 9);
                const iH = iW * 9 / 16;
                const iL = (window.innerWidth - iW) / 2;
                const iT = window.innerHeight * 0.08;
                iframe.style.cssText = `position:absolute;border:none;background:#000;pointer-events:auto;border-radius:6px;box-shadow:0 0 80px rgba(255,105,180,0.4),0 0 160px rgba(138,43,226,0.2);left:${iL}px;top:${iT}px;width:${iW}px;height:${iH}px;`;
                stageVideoIframe = iframe;
            }
        }, 500);
    } else {
        // フォールバック: 通常のiframe（YT API未ロード時）
        const stageIframe = document.createElement('iframe');
        stageIframe.id = 'stage-video-iframe';
        stageIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&enablejsapi=1&controls=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`;
        stageIframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        stageIframe.setAttribute('allowfullscreen', '');
        // 初期位置: 画面上部中央に配置（updateStageVideoOverlayで毎フレーム更新される）
        const fbIW = Math.min(window.innerWidth * 0.52, window.innerHeight * 0.32 * 16 / 9);
        const fbIH = fbIW * 9 / 16;
        const fbIL = (window.innerWidth - fbIW) / 2;
        const fbIT = window.innerHeight * 0.08;
        stageIframe.style.cssText = `position:absolute;border:none;background:#000;pointer-events:auto;border-radius:6px;box-shadow:0 0 80px rgba(255,105,180,0.4),0 0 160px rgba(138,43,226,0.2);left:${fbIL}px;top:${fbIT}px;width:${fbIW}px;height:${fbIH}px;`;
        stageVideoContainer.appendChild(stageIframe);
        stageVideoIframe = stageIframe;
    }
    stageVideoActive = true;

    // 右下オーバーレイにはタイトルのみ（音声はステージiframeから）
    const videoOverlay = document.getElementById('video-overlay');
    if (videoOverlay) {
        const oldIframe = videoOverlay.querySelector('iframe');
        if (oldIframe) { oldIframe.src = ''; oldIframe.remove(); }
        const titleBar = document.getElementById('video-overlay-title');
        if (titleBar) titleBar.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' + title;
        videoOverlay.classList.add('active');
    }

    // ★ 通常モード用：背景にも動画を敷く（半透明）
    updateBgVideo(videoId);
}

// ★ ステージ動画除去
function removeStageVideo() {
    if (ytPlayer && ytPlayer.destroy) {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
    }
    if (stageVideoIframe) {
        try { stageVideoIframe.src = ''; } catch(e) {}
    }
    stageVideoContainer.innerHTML = '';
    stageVideoContainer.style.display = 'none';
    stageVideoIframe = null;
    stageVideoActive = false;
    stageVideoShowingIframe = true;
    // backScreenテクスチャを通常に戻す
    if (backScreen && backScreen.material) {
        backScreen.material.opacity = 0.95;
    }
}

// ★ backScreenのスクリーン座標を計算 — 通常モード・探索モード両方で3D投影
function updateStageVideoOverlay() {
    if (!stageVideoIframe) return;

    const activeScreen = glbBackScreen || backScreen;
    if (!activeScreen) {
        // スクリーンオブジェクトがまだロードされていない場合 → 中央フォールバック
        const vw = window.innerWidth, vh = window.innerHeight;
        const fbW = Math.min(vw * 0.5, 800);
        const fbH = fbW * 9 / 16;
        stageVideoIframe.style.display = 'block';
        stageVideoIframe.style.left = ((vw - fbW) / 2) + 'px';
        stageVideoIframe.style.top = ((vh - fbH) / 2) + 'px';
        stageVideoIframe.style.width = fbW + 'px';
        stageVideoIframe.style.height = fbH + 'px';
        stageVideoShowingIframe = true;
        return;
    }

    // カメラとスクリーンのワールド行列を更新
    camera.updateMatrixWorld();
    activeScreen.updateWorldMatrix(true, false);

    // 四隅をローカル座標で取得
    let screenCorners;
    if (activeScreen === glbBackScreen) {
        if (!glbBackScreen.geometry.boundingBox) glbBackScreen.geometry.computeBoundingBox();
        const bb = glbBackScreen.geometry.boundingBox;
        screenCorners = [
            new THREE.Vector3(bb.min.x, bb.max.y, (bb.min.z + bb.max.z) / 2),
            new THREE.Vector3(bb.max.x, bb.max.y, (bb.min.z + bb.max.z) / 2),
            new THREE.Vector3(bb.min.x, bb.min.y, (bb.min.z + bb.max.z) / 2),
            new THREE.Vector3(bb.max.x, bb.min.y, (bb.min.z + bb.max.z) / 2),
        ];
    } else {
        const halfW = 12, halfH = 5;
        screenCorners = [
            new THREE.Vector3(-halfW, halfH, 0),
            new THREE.Vector3(halfW, halfH, 0),
            new THREE.Vector3(-halfW, -halfH, 0),
            new THREE.Vector3(halfW, -halfH, 0),
        ];
    }

    // ワールド座標→スクリーン座標に射影
    const pts = [];
    let behindCamera = false;
    for (const c of screenCorners) {
        const w = c.clone().applyMatrix4(activeScreen.matrixWorld);
        const ndc = w.project(camera);
        if (ndc.z > 1) { behindCamera = true; break; }
        pts.push({
            x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
            y: (-ndc.y * 0.5 + 0.5) * window.innerHeight
        });
    }

    if (behindCamera || pts.length < 4) {
        // スクリーンがカメラの後ろ → フォールバック表示
        const vw = window.innerWidth, vh = window.innerHeight;
        const fbW = Math.min(vw * 0.45, 640);
        const fbH = fbW * 9 / 16;
        const offsetX = exploreMode ? -150 : 0; // 探索パネル回避
        stageVideoIframe.style.display = 'block';
        stageVideoIframe.style.left = ((vw - fbW) / 2 + offsetX) + 'px';
        stageVideoIframe.style.top = ((vh - fbH) / 2) + 'px';
        stageVideoIframe.style.width = fbW + 'px';
        stageVideoIframe.style.height = fbH + 'px';
        if (activeScreen.material) activeScreen.material.opacity = 0.95;
        stageVideoShowingIframe = true;
        return;
    }

    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const left = Math.min(...xs), top = Math.min(...ys);
    const projW = Math.max(...xs) - left, projH = Math.max(...ys) - top;

    if (projW < 20 || projH < 15 ||
        left + projW < -50 || top + projH < -50 ||
        left > window.innerWidth + 50 || top > window.innerHeight + 50) {
        // 小さすぎるまたは画面外 → フォールバック
        const vw = window.innerWidth, vh = window.innerHeight;
        const fbW = Math.min(vw * 0.45, 640);
        const fbH = fbW * 9 / 16;
        const offsetX = exploreMode ? -150 : 0;
        stageVideoIframe.style.display = 'block';
        stageVideoIframe.style.left = ((vw - fbW) / 2 + offsetX) + 'px';
        stageVideoIframe.style.top = ((vh - fbH) / 2) + 'px';
        stageVideoIframe.style.width = fbW + 'px';
        stageVideoIframe.style.height = fbH + 'px';
        if (activeScreen.material) activeScreen.material.opacity = 0.95;
        stageVideoShowingIframe = true;
        return;
    }

    // 投影成功 → iframeをGLBバックスクリーンに重ねて配置
    if (activeScreen.material) activeScreen.material.opacity = 0.15;
    stageVideoShowingIframe = true;
    stageVideoIframe.style.display = 'block';
    stageVideoIframe.style.left = left + 'px';
    stageVideoIframe.style.top = top + 'px';
    stageVideoIframe.style.width = projW + 'px';
    stageVideoIframe.style.height = projH + 'px';
}

// 曲切替時のフラッシュ演出
function createSongTransitionFlash(theme) {
    const flash = document.createElement('div');
    const [r, g, b] = theme.primary;
    flash.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background: radial-gradient(circle at center,
            rgba(${r*255|0},${g*255|0},${b*255|0}, 0.6) 0%,
            rgba(${r*255|0},${g*255|0},${b*255|0}, 0.2) 40%,
            transparent 70%);
        z-index:9999; pointer-events:none;
        animation: songFlash 0.8s ease forwards;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 900);
}

// 動画オーバーレイを閉じる共通関数
function closeVideoOverlay() {
    // 自動再生タイマーをクリア
    if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; }
    const overlay = document.getElementById('video-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        const iframe = overlay.querySelector('iframe');
        if (iframe) {
            iframe.src = '';
            setTimeout(() => iframe.remove(), 100);
        }
    }
    removeStageVideo();
    removeBgVideo();
    isMusicPlaying = false;
    musicBeat = 0;
    currentSongId = null;
    currentSongTheme = null;
    // ★ スクリーン写真のローテーションを再開
    lastPhotoChange = 0;
    document.getElementById('music-now-playing')?.classList.remove('active');
}

// ★ 背景動画（パフォーマンスのため廃止 — シェーダー背景で十分）
function updateBgVideo(videoId) { /* 廃止 */ }
function removeBgVideo() { /* 廃止 */ }

// Close video overlay button
document.getElementById('video-overlay-close')?.addEventListener('click', closeVideoOverlay);

// Close video overlay on background click
document.getElementById('video-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'video-overlay') closeVideoOverlay();
});

// スキップボタン（次の曲へ）
document.getElementById('video-skip-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    playNextSong();
});

// 動画オーバーレイの一時停止/再生ボタン
function toggleVideoPlayPause() {
    const iframe = stageVideoIframe || document.getElementById('active-video-iframe');
    if (!iframe) return;
    const vpBtn = document.getElementById('video-pause-btn');
    if (isMusicPlaying) {
        iframe.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        if (ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch(e) {} }
        isMusicPlaying = false;
        musicBeat = 0;
        if (vpBtn) vpBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        // NOW PLAYING側も同期
        const npBtn = document.getElementById('music-pause');
        if (npBtn) npBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    } else {
        iframe.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        if (ytPlayer && ytPlayer.playVideo) {
            try {
                ytPlayer.playVideo();
                setTimeout(() => { try { ytPlayer.unMute(); ytPlayer.setVolume(100); } catch(e) {} }, 300);
            } catch(e) {}
        }
        isMusicPlaying = true;
        startFakeAnalyser();
        if (vpBtn) vpBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        // NOW PLAYING側も同期
        const npBtn = document.getElementById('music-pause');
        if (npBtn) npBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }
}

document.getElementById('video-pause-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVideoPlayPause();
});

// タイトルタップでも再生/停止
document.getElementById('video-overlay-title')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVideoPlayPause();
});

// 自動再生トグルボタン
const autoPlayBtn = document.getElementById('video-autoplay-btn');
if (autoPlayBtn) {
    autoPlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        autoPlayEnabled = !autoPlayEnabled;
        autoPlayBtn.classList.toggle('active', autoPlayEnabled);
        autoPlayBtn.title = autoPlayEnabled ? '自動再生 ON' : '自動再生 OFF';
        autoPlayBtn.style.opacity = autoPlayEnabled ? '1' : '0.4';
    });
}

// シャッフル再生トグルボタン
const shuffleBtn = document.getElementById('video-shuffle-btn');
if (shuffleBtn) {
    shuffleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shuffleEnabled = !shuffleEnabled;
        shuffleBtn.classList.toggle('active', shuffleEnabled);
        shuffleBtn.title = shuffleEnabled ? 'シャッフル ON' : 'シャッフル OFF';
        shuffleBtn.style.opacity = shuffleEnabled ? '1' : '0.4';
    });
}

// ==================== モバイル: 再生バーのドラッグ移動 ====================
(function initOverlayDrag() {
    const overlay = document.getElementById('video-overlay');
    if (!overlay) return;
    let isDragging = false;
    let startY = 0;
    let startBottom = 0;
    let dragThreshold = 8; // px - この距離以上動かしたらドラッグとみなす
    let hasMoved = false;

    overlay.addEventListener('touchstart', (e) => {
        // ボタン類のタッチは無視
        if (e.target.closest('button') || e.target.closest('.video-overlay-title')) return;
        const touch = e.touches[0];
        startY = touch.clientY;
        const rect = overlay.getBoundingClientRect();
        startBottom = window.innerHeight - rect.bottom;
        hasMoved = false;
    }, { passive: true });

    overlay.addEventListener('touchmove', (e) => {
        if (startY === 0) return;
        const touch = e.touches[0];
        const deltaY = startY - touch.clientY;
        if (!hasMoved && Math.abs(deltaY) < dragThreshold) return;
        hasMoved = true;
        if (!isDragging) {
            isDragging = true;
            overlay.classList.add('dragging');
        }
        const newBottom = Math.max(5, Math.min(window.innerHeight - 70, startBottom + deltaY));
        overlay.style.bottom = newBottom + 'px';
        e.preventDefault();
    }, { passive: false });

    overlay.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
            overlay.classList.remove('dragging');
        }
        startY = 0;
    });
})();

// 一時停止/再開ボタン — NOW PLAYING側（動画オーバーレイと同じ関数を使う）
document.getElementById('music-pause')?.addEventListener('click', () => {
    toggleVideoPlayPause();
});

// ==================== 強化ビートシミュレーター ====================
// 曲ごとの BPM に連動したリアルなビート検出シミュレーション
let fakeAnalyserInterval = null;
let beatPhase = 0;
let lastBeatTime = 0;

function startFakeAnalyser() {
    if (fakeAnalyserInterval) return;
    const startTime = performance.now();
    fakeAnalyserInterval = setInterval(() => {
        if (!isMusicPlaying) {
            musicBeat = Math.max(0, musicBeat - 0.08);
            if (musicBeat <= 0) {
                clearInterval(fakeAnalyserInterval);
                fakeAnalyserInterval = null;
            }
            return;
        }
        const theme = currentSongTheme || defaultTheme;
        const now = performance.now();
        const bps = theme.bpm / 60; // beats per second
        const beatInterval = 1000 / bps;
        beatPhase = ((now - startTime) % beatInterval) / beatInterval;

        // メインビート（BPM同期）
        const mainBeat = Math.pow(Math.max(0, 1 - beatPhase * 3), 2);
        // サブビート（オフビート）
        const subBeat = Math.pow(Math.max(0, 1 - Math.abs(beatPhase - 0.5) * 6), 2) * 0.4;
        // ベースライン（ずっと脈打つ）
        const baseline = Math.sin(now * 0.003 * (theme.bpm / 130)) * 0.15 + 0.2;
        // ランダムアクセント（サビ的なもの）
        const accent = Math.random() > (1 - theme.strobeChance * 0.3) ? Math.random() * 0.3 : 0;
        // ドロップ（まれに大きなスパイク）
        const drop = Math.random() > 0.97 ? 0.5 : 0;

        musicBeat = Math.min(1.0, (mainBeat + subBeat + baseline + accent + drop) * theme.intensity);
    }, 30); // 30ms = 高精度
}

// Visualizer bars (real animation driven by musicBeat)
const vizBars = document.querySelectorAll('.viz-bar');
function animateVizBars() {
    vizBars.forEach((bar, i) => {
        let h;
        if (isMusicPlaying) {
            const phase = performance.now() * 0.005 + i * 0.8;
            h = 5 + (Math.sin(phase) * 0.5 + 0.5) * 25 * musicBeat + Math.random() * 5;
        } else {
            h = Math.random() * 8 + 3;
        }
        bar.style.height = h + 'px';
    });
    requestAnimationFrame(() => setTimeout(animateVizBars, 80));
}
animateVizBars();

// ==================== LOADING SCREEN ====================
let loadProgress = 0;
const loaderPercent = document.querySelector('.loader-percent');
const loadInterval = setInterval(() => {
    loadProgress += Math.random() * 8 + 2;
    if (loadProgress >= 100) { loadProgress = 100; clearInterval(loadInterval); }
    if (loaderPercent) loaderPercent.textContent = Math.floor(loadProgress) + '%';
}, 80);

window.addEventListener('load', () => {
    setTimeout(() => {
        loadProgress = 100;
        if (loaderPercent) loaderPercent.textContent = '100%';
        setTimeout(() => {
            document.getElementById('loading-screen')?.classList.add('hidden');
            equalFormed = true;
        }, 500);
    }, 2000);
});

// ==================== SCROLL HANDLING ====================
let scrollY = 0;
const fabTop = document.getElementById('fab-top');

window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
    document.getElementById('navbar')?.classList.toggle('scrolled', scrollY > 60);

    const sections = document.querySelectorAll('.section');
    const navLinks = document.querySelectorAll('.nav-link');
    let current = 0;
    sections.forEach((section, i) => {
        if (scrollY >= section.offsetTop - window.innerHeight / 2) current = i;
    });
    navLinks.forEach((link, i) => link.classList.toggle('active', i === current));

    fabTop?.classList.toggle('visible', scrollY > window.innerHeight * 0.5);
    revealElements();
    animateStats();
});

fabTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ==================== REVEAL ANIMATIONS ====================
function revealElements() {
    document.querySelectorAll('.about-card, .member-card, .disco-card, .info-card, .music-card').forEach(el => {
        const rect = el.getBoundingClientRect();
        const delay = parseInt(el.dataset.delay) || 0;
        if (rect.top < window.innerHeight * 0.88) setTimeout(() => el.classList.add('visible'), delay);
    });
    document.querySelectorAll('.timeline-item').forEach(el => {
        const rect = el.getBoundingClientRect();
        const delay = parseInt(el.dataset.delay) || 0;
        if (rect.top < window.innerHeight * 0.85) setTimeout(() => el.classList.add('visible'), delay);
    });
    document.querySelectorAll('.stat-item').forEach(el => {
        const rect = el.getBoundingClientRect();
        const delay = parseInt(el.dataset.delay) || 0;
        if (rect.top < window.innerHeight * 0.85) setTimeout(() => el.classList.add('visible'), delay);
    });
    document.querySelectorAll('.info-card').forEach(el => {
        const rect = el.getBoundingClientRect();
        const delay = parseInt(el.dataset.delay) || 0;
        if (rect.top < window.innerHeight * 0.88) setTimeout(() => el.classList.add('visible'), delay);
    });
}

// ==================== STATS COUNTER + RING ANIMATION ====================
let statsAnimated = false;
function animateStats() {
    if (statsAnimated) return;
    const statsGrid = document.querySelector('.about-stats');
    if (!statsGrid) return;
    const rect = statsGrid.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85) {
        statsAnimated = true;
        document.querySelectorAll('.stat-number').forEach(el => {
            const target = parseInt(el.dataset.target);
            const duration = 2200;
            const start = performance.now();
            function update(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(target * eased).toLocaleString();
                if (progress < 1) requestAnimationFrame(update);
            }
            requestAnimationFrame(update);
        });
        document.querySelectorAll('.stat-ring-fill').forEach(circle => {
            const percent = parseInt(circle.dataset.percent) || 0;
            const circumference = 2 * Math.PI * 54;
            const offset = circumference - (percent / 100) * circumference;
            circle.style.setProperty('--offset', offset);
            setTimeout(() => circle.classList.add('animated'), 100);
        });
    }
}

// ==================== SMOOTH SCROLL NAV ====================
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = link.getAttribute('href');
        const target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
});

// ==================== PARALLAX ON SCROLL ====================
function getScrollParallax() {
    const scrollMax = document.body.scrollHeight - window.innerHeight;
    return scrollMax > 0 ? scrollY / scrollMax : 0;
}

// ==================== ENHANCED STAGE EFFECTS ====================
// Laser beam system for concert feel
const laserCount = 12;
const laserGroup = new THREE.Group();
for (let i = 0; i < laserCount; i++) {
    const laserGeo = new THREE.CylinderGeometry(0.012, 0.003, 25, 4);
    const hue = (i / laserCount);
    const laserMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 1, 0.6),
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
    });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.set((i - laserCount / 2) * 1.5, 3, -6);
    laser.userData = {
        baseAngle: (Math.PI * 2 * i) / laserCount,
        speed: 0.3 + Math.random() * 1.0,
        hue: hue,
    };
    laserGroup.add(laser);
}
scene.add(laserGroup);

// Strobe flash particles for stage
const strobeGeo = new THREE.BufferGeometry();
const strobeCount = 200;
const strobePositions = new Float32Array(strobeCount * 3);
for (let i = 0; i < strobeCount; i++) {
    strobePositions[i * 3] = (Math.random() - 0.5) * 25;
    strobePositions[i * 3 + 1] = Math.random() * 12 - 3;
    strobePositions[i * 3 + 2] = (Math.random() - 0.5) * 15 - 3;
}
strobeGeo.setAttribute('position', new THREE.BufferAttribute(strobePositions, 3));
const strobeMat = new THREE.PointsMaterial({
    size: 0.12,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
});
const strobeParticles = new THREE.Points(strobeGeo, strobeMat);
scene.add(strobeParticles);

// Spotlight cones for stage floor
const spotCount = 5;
const spotGroup = new THREE.Group();
for (let i = 0; i < spotCount; i++) {
    const coneGeo = new THREE.ConeGeometry(2.5, 12, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
        color: penlightColors[i % penlightColors.length],
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set((i - spotCount / 2) * 4, 8, -6);
    cone.rotation.x = Math.PI;
    cone.userData = {
        phaseOffset: (Math.PI * 2 * i) / spotCount,
        colorIndex: i % penlightColors.length,
    };
    spotGroup.add(cone);
}
scene.add(spotGroup);

// ==================== 3D LIVE STAGE（大規模アリーナ） ====================
// GLBモデル使用フラグ（falseにすると従来のプログラム生成ステージにフォールバック）
const USE_GLB_STAGE = true;
const stageGroup = new THREE.Group();
let glbStageModel = null; // GLBモデル参照
let glbBackScreen = null; // GLBモデルのバックスクリーン参照
let glbFrontScreens = []; // GLBモデルのフロントスクリーン参照
let glbCeilingScreens = []; // GLBモデルの天井スクリーン参照
let glbStickLights = []; // GLBモデルの観客ペンライト参照
let glbStageMeshes = []; // GLBモデルのステージ本体メッシュ参照
const screenBorders = [];
const stageMovingLights = [];
const stageTowerLights = [];
const stageSpotBeams = [];
const stageSilhouettes = [];
const stageFloorLEDs = [];
const stageFireworks = [];

// --- ステージ床（巨大・反射する LED フロア風）---
const stageFloorGeo = new THREE.BoxGeometry(28, 0.2, 14);
const stageFloorMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a1a,
    transparent: true,
    opacity: 0.75,
});
const stageFloor = new THREE.Mesh(stageFloorGeo, stageFloorMat);
stageFloor.position.set(0, -5.5, -9);
stageGroup.add(stageFloor);

// フロアLEDグリッド（光るパネル）
for (let x = -6; x <= 6; x++) {
    for (let z = -3; z <= 3; z++) {
        const ledGeo = new THREE.PlaneGeometry(1.8, 1.6);
        const ledMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(Math.random(), 1, 0.5),
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.rotation.x = -Math.PI / 2;
        led.position.set(x * 2.0, -5.38, z * 2.0 - 9);
        led.userData = { gridX: x, gridZ: z, baseHue: Math.random(), isFloorLED: true };
        stageGroup.add(led);
        stageFloorLEDs.push(led);
    }
}

// ステージ前面のエッジライト（3本のライン）
for (let row = 0; row < 3; row++) {
    const edgeGeo = new THREE.BoxGeometry(28 + row * 0.5, 0.06, 0.06);
    const edgeMat = new THREE.MeshBasicMaterial({
        color: row === 1 ? 0x00bfff : 0xff1493,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(0, -5.35 + row * 0.05, -2.1 + row * 0.1);
    stageGroup.add(edge);
}

// --- 巨大トラス構造（上部照明リグ3段）---
for (let row = 0; row < 3; row++) {
    const trussW = 26 - row * 2;
    const trussH = 7.5 + row * 1.5;
    const trussZ = -8 - row * 2;
    // 横バー
    const tGeo = new THREE.BoxGeometry(trussW, 0.15, 0.15);
    const tMat = new THREE.MeshBasicMaterial({ color: 0x444466, transparent: true, opacity: 0.6 });
    const tBar = new THREE.Mesh(tGeo, tMat);
    tBar.position.set(0, trussH, trussZ);
    stageGroup.add(tBar);

    // ムービングライト（各段に8-12個）
    const mlCount = 10 - row * 2;
    for (let i = 0; i < mlCount; i++) {
        // ライトハウジング
        const mlGeo = new THREE.SphereGeometry(0.18, 12, 12);
        const mlMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(i / mlCount, 1, 0.65),
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
        });
        const ml = new THREE.Mesh(mlGeo, mlMat);
        const xPos = (i - mlCount / 2 + 0.5) * (trussW / mlCount);
        ml.position.set(xPos, trussH - 0.3, trussZ);
        ml.userData = { isMovingLight: true, phase: (i / mlCount + row * 0.3) * Math.PI * 2, row, idx: i };
        stageGroup.add(ml);
        stageMovingLights.push(ml);

        // ライトビーム（コーン）
        const beamGeo = new THREE.ConeGeometry(1.8 - row * 0.3, 14 - row * 2, 12, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
            color: mlMat.color.clone(),
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.copy(ml.position);
        beam.position.y -= 7;
        beam.userData = { isSpotBeam: true, parentLight: ml, row, phase: ml.userData.phase };
        stageGroup.add(beam);
        stageSpotBeams.push(beam);
    }
}

// --- 左右の巨大タワー（4本）---
const towerPositions = [
    { x: -13.5, z: -7, side: -1 },
    { x: 13.5, z: -7, side: 1 },
    { x: -11, z: -13, side: -1 },
    { x: 11, z: -13, side: 1 },
];
towerPositions.forEach((tp, tIdx) => {
    // メインタワー
    const towerGeo = new THREE.BoxGeometry(0.5, 16, 0.5);
    const towerMat = new THREE.MeshBasicMaterial({ color: 0x222233 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(tp.x, 2, tp.z);
    stageGroup.add(tower);

    // タワー上のライト（3段）
    for (let lv = 0; lv < 3; lv++) {
        const tlGeo = new THREE.SphereGeometry(0.25 - lv * 0.05, 8, 8);
        const tlMat = new THREE.MeshBasicMaterial({
            color: tp.side < 0 ? 0xff1493 : 0x00bfff,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
        });
        const tl = new THREE.Mesh(tlGeo, tlMat);
        tl.position.set(tp.x, 8 + lv * 1.2, tp.z);
        tl.userData = { isTowerLight: true, side: tp.side, phase: tIdx * 0.8 + lv * 0.5, level: lv };
        stageGroup.add(tl);
        stageTowerLights.push(tl);
    }

    // タワー上のスポットライトビーム
    const tBeamGeo = new THREE.ConeGeometry(3, 20, 12, 1, true);
    const tBeamMat = new THREE.MeshBasicMaterial({
        color: tp.side < 0 ? 0xff1493 : 0x00bfff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const tBeam = new THREE.Mesh(tBeamGeo, tBeamMat);
    tBeam.position.set(tp.x, 0, tp.z);
    tBeam.rotation.z = tp.side * 0.3;
    tBeam.userData = { isSpotBeam: true, isTower: true, side: tp.side, phase: tIdx * 1.2 };
    stageGroup.add(tBeam);
    stageSpotBeams.push(tBeam);

    // スピーカースタック（各タワーに2段）
    for (let s = 0; s < 2; s++) {
        const spkGeo = new THREE.BoxGeometry(1.6, 1.0, 0.9);
        const spkMat = new THREE.MeshBasicMaterial({ color: 0x111122, transparent: true, opacity: 0.7 });
        const spk = new THREE.Mesh(spkGeo, spkMat);
        spk.position.set(tp.x + tp.side * 0.3, -2 + s * 1.2, tp.z + 0.5);
        stageGroup.add(spk);
    }
});

// --- バックスクリーン（巨大LED ビジョン）---
const screenGeo = new THREE.PlaneGeometry(24, 10);
const screenMat = new THREE.MeshBasicMaterial({
    color: 0x111122,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
});
const backScreen = new THREE.Mesh(screenGeo, screenMat);
backScreen.position.set(0, 1.5, -15.5);
stageGroup.add(backScreen);

// バックスクリーンのLED枠（4辺 + コーナー装飾）
const borderDefs = [
    { w: 24.6, h: 0.12, x: 0, y: 6.58 },   // 上
    { w: 24.6, h: 0.12, x: 0, y: -3.52 },   // 下
    { w: 0.12, h: 10.2, x: -12.35, y: 1.5 }, // 左
    { w: 0.12, h: 10.2, x: 12.35, y: 1.5 },  // 右
];
borderDefs.forEach((bd, i) => {
    const bGeo = new THREE.BoxGeometry(bd.w, bd.h, 0.05);
    const bMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff1493 : 0x00bfff,
        transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending,
    });
    const b = new THREE.Mesh(bGeo, bMat);
    b.position.set(bd.x, bd.y, -15.45);
    stageGroup.add(b);
    screenBorders.push(b);
});

// サブスクリーン（左右2枚）
const subScreenPositions = [{ x: -15, rot: 0.25 }, { x: 15, rot: -0.25 }];
const subScreens = [];
subScreenPositions.forEach(sp => {
    const ssGeo = new THREE.PlaneGeometry(8, 5);
    const ssMat = new THREE.MeshBasicMaterial({
        color: 0x111122,
        transparent: true, opacity: 0.8,
        side: THREE.DoubleSide,
    });
    const ss = new THREE.Mesh(ssGeo, ssMat);
    ss.position.set(sp.x, 3, -12);
    ss.rotation.y = sp.rot;
    stageGroup.add(ss);
    subScreens.push(ss);
});

// --- バックスクリーン写真システム ---
const screenPhotos = [
    '_cf4UTe1qrY', 'F3P8vcZkIh4', '17NBPoc78oM', 'cyRZGtNx_a4',
    'C8WMX7dEH7Y', 'Y1Bboo5KXL4', '20QJax8CwQo', 'suf7S4AKdmY',
    'ShbfYtAPXuI', 'Q1-yYjZqk7o', 'skgh3juWdFU', '8id6i_QeNJM',
    'iEYwHScdJFQ', 'J5eTB_0SEeg', 'Mq_wPiAJO7Q', 'Bot92Nn-ozk',
    'w0N0TiOlAY0', 'YIjPbF-dKQA', 'xOAaBsPaPpY',
];
let currentPhotoIndex = 0;
const textureLoader = new THREE.TextureLoader();

function loadScreenPhoto(index) {
    const videoId = screenPhotos[index % screenPhotos.length];
    return new Promise((resolve) => {
        textureLoader.load(
            `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            (loaded) => resolve(loaded),
            undefined,
            () => resolve(null)
        );
    });
}

// 初期写真ロード（メイン + サブスクリーン全部に）
loadScreenPhoto(0).then(tex => {
    if (tex) {
        backScreen.material.map = tex;
        backScreen.material.color.set(0xffffff);
        backScreen.material.needsUpdate = true;
        subScreens.forEach(ss => {
            ss.material.map = tex;
            ss.material.color.set(0xffffff);
            ss.material.needsUpdate = true;
        });
    }
});

let lastPhotoChange = 0;
function updateScreenPhoto(elapsed) {
    if (elapsed - lastPhotoChange > 8) {
        lastPhotoChange = elapsed;
        // 再生中の曲がscreenPhotosにある場合はその曲を固定、なければ直接サムネイルで固定
        if (currentSongId) {
            const idx = screenPhotos.indexOf(currentSongId);
            if (idx >= 0) {
                currentPhotoIndex = idx;
            } else {
                // カップリング曲等：直接YouTubeサムネイルを読み込んで全スクリーンに反映
                const directLoader = new THREE.TextureLoader();
                directLoader.load(`https://img.youtube.com/vi/${currentSongId}/hqdefault.jpg`, (tex) => {
                    if (tex) {
                        if (backScreen.material.map && backScreen.material.map !== tex) backScreen.material.map.dispose();
                        backScreen.material.map = tex;
                        backScreen.material.needsUpdate = true;
                        subScreens.forEach(ss => { ss.material.map = tex; ss.material.needsUpdate = true; });
                        if (glbBackScreen) {
                            const g = tex.clone(); g.flipY = false; g.needsUpdate = true;
                            glbBackScreen.material.map = g; glbBackScreen.material.needsUpdate = true;
                        }
                        glbFrontScreens.forEach(fs => {
                            const f = tex.clone(); f.flipY = false; f.needsUpdate = true;
                            fs.material.map = f; fs.material.needsUpdate = true;
                        });
                        glbCeilingScreens.forEach(cs => {
                            const c = tex.clone(); c.flipY = false; c.needsUpdate = true;
                            if (cs.material.map) cs.material.map.dispose();
                            cs.material.map = c; cs.material.opacity = 1.0; cs.material.needsUpdate = true;
                        });
                    }
                });
                return; // 直接読み込み済みなので以降のscreenPhotos処理をスキップ
            }
        } else {
            currentPhotoIndex = (currentPhotoIndex + 1) % screenPhotos.length;
        }
        loadScreenPhoto(currentPhotoIndex).then(tex => {
            if (tex) {
                // 古いテクスチャをdispose（メモリリーク防止）
                if (backScreen.material.map && backScreen.material.map !== tex) {
                    backScreen.material.map.dispose();
                }
                backScreen.material.map = tex;
                backScreen.material.needsUpdate = true;
                subScreens.forEach(ss => {
                    ss.material.map = tex;
                    ss.material.needsUpdate = true;
                });
                // GLBスクリーンにも同期（flipYを反転した複製テクスチャを使用）
                if (glbBackScreen) {
                    const glbTex = tex.clone();
                    glbTex.flipY = false;
                    glbTex.needsUpdate = true;
                    glbBackScreen.material.map = glbTex;
                    glbBackScreen.material.needsUpdate = true;
                }
                glbFrontScreens.forEach(fs => {
                    const fsTex = tex.clone();
                    fsTex.flipY = false;
                    fsTex.needsUpdate = true;
                    fs.material.map = fsTex;
                    fs.material.needsUpdate = true;
                });
                glbCeilingScreens.forEach(cs => {
                    const csTex = tex.clone();
                    csTex.flipY = false;
                    csTex.needsUpdate = true;
                    if (cs.material.map && cs.material.map !== csTex) cs.material.map.dispose();
                    cs.material.map = csTex;
                    cs.material.opacity = 1.0;
                    cs.material.needsUpdate = true;
                });
            }
        });
    }
}

// --- ステージ上のシルエットキャラクター（10人・リアルアイドル風）---
const silhouetteCount = 10;
// メンバーごとの衣装スタイル（5パターン×2で全員違う）
const costumeStyles = ['frilly','cool','princess','sporty','elegant','frilly','cool','princess','sporty','elegant'];
// メンバーごとの身長差（小さなバリエーション）
const heightVariation = [0.95, 1.0, 0.92, 1.05, 0.98, 1.02, 0.93, 1.0, 0.97, 1.03];

for (let i = 0; i < silhouetteCount; i++) {
    const silGroup = new THREE.Group();
    const memberColor = penlightColors[i % penlightColors.length];
    const glowColor = memberColor.clone();
    const brighterColor = memberColor.clone().multiplyScalar(1.3);
    const hScale = heightVariation[i]; // 身長スケール
    const costume = costumeStyles[i];

    // === 体（上半身：スリムなトルソ + ウエストくびれ）===
    const torsoGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.65 * hScale, 10);
    const torsoMat = new THREE.MeshPhongMaterial({
        color: memberColor,
        emissive: memberColor, emissiveIntensity: 0.3,
        shininess: 80,
    });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.85 * hScale;
    silGroup.add(torso);

    // === 肩のフリル / ディティール ===
    if (costume === 'frilly' || costume === 'princess') {
        for (let side = -1; side <= 1; side += 2) {
            const frillGeo = new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
            const frillMat = new THREE.MeshBasicMaterial({
                color: brighterColor,
                side: THREE.DoubleSide,
            });
            const frill = new THREE.Mesh(frillGeo, frillMat);
            frill.position.set(side * 0.18, 1.15 * hScale, 0);
            frill.scale.set(1.3, 0.6, 1);
            silGroup.add(frill);
        }
    }

    // === スカート（衣装スタイル別）===
    let skirt;
    if (costume === 'frilly' || costume === 'princess') {
        // フリルスカート（ふわっと広がる・多層）
        const skirtGeo = new THREE.ConeGeometry(0.55, 0.6 * hScale, 16, 1, true);
        const skirtMat = new THREE.MeshPhongMaterial({
            color: memberColor,
            side: THREE.DoubleSide, emissive: memberColor, emissiveIntensity: 0.15,
        });
        skirt = new THREE.Mesh(skirtGeo, skirtMat);
        skirt.position.y = 0.35 * hScale;
        skirt.rotation.x = Math.PI;
        // サブレイヤー（チュール風）
        const tulle = new THREE.Mesh(
            new THREE.ConeGeometry(0.58, 0.55 * hScale, 16, 1, true),
            new THREE.MeshBasicMaterial({
                color: brighterColor, transparent: true, opacity: 0.2,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        tulle.position.y = 0.37 * hScale;
        tulle.rotation.x = Math.PI;
        tulle.userData = { isSkirt: true };
        silGroup.add(tulle);
    } else if (costume === 'cool' || costume === 'sporty') {
        // タイトスカート（シャープ）
        const skirtGeo = new THREE.ConeGeometry(0.3, 0.5 * hScale, 10, 1, true);
        const skirtMat = new THREE.MeshPhongMaterial({
            color: memberColor,
            side: THREE.DoubleSide, emissive: memberColor, emissiveIntensity: 0.2,
        });
        skirt = new THREE.Mesh(skirtGeo, skirtMat);
        skirt.position.y = 0.32 * hScale;
        skirt.rotation.x = Math.PI;
    } else {
        // エレガントロングスカート
        const skirtGeo = new THREE.ConeGeometry(0.5, 0.75 * hScale, 14, 1, true);
        const skirtMat = new THREE.MeshPhongMaterial({
            color: memberColor,
            side: THREE.DoubleSide, emissive: memberColor, emissiveIntensity: 0.2,
        });
        skirt = new THREE.Mesh(skirtGeo, skirtMat);
        skirt.position.y = 0.25 * hScale;
        skirt.rotation.x = Math.PI;
    }
    skirt.userData = { isSkirt: true };
    silGroup.add(skirt);

    // === 脚（ハイヒールブーツ風、少し長く）===
    for (let leg = -1; leg <= 1; leg += 2) {
        const legGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.55 * hScale, 8);
        const legMat = new THREE.MeshPhongMaterial({
            color: memberColor,
            emissive: memberColor, emissiveIntensity: 0.15,
        });
        const legMesh = new THREE.Mesh(legGeo, legMat);
        legMesh.position.set(leg * 0.1, -0.15 * hScale, 0);
        silGroup.add(legMesh);
        // ブーツ先端
        const bootGeo = new THREE.SphereGeometry(0.045, 6, 4, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7);
        const bootMat = new THREE.MeshBasicMaterial({
            color: brighterColor,
        });
        const boot = new THREE.Mesh(bootGeo, bootMat);
        boot.position.set(leg * 0.1, -0.45 * hScale, 0.02);
        silGroup.add(boot);
    }

    // === 頭（アニメ風のやや大きめ）===
    const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const headMat = new THREE.MeshPhongMaterial({
        color: memberColor,
        emissive: memberColor, emissiveIntensity: 0.2,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.38 * hScale;
    silGroup.add(head);

    // === 髪（4スタイル: ロング, ツインテ, ボブ, ポニーテール）===
    const hairStyle = i % 4;
    const darkColor = memberColor.clone().multiplyScalar(0.7);
    if (hairStyle === 0) {
        // ロングヘア（背面にたっぷり流れる + 前髪）
        const hairGeo = new THREE.CylinderGeometry(0.2, 0.05, 0.85 * hScale, 10);
        const hairMat = new THREE.MeshPhongMaterial({
            color: darkColor,
            emissive: memberColor, emissiveIntensity: 0.1,
        });
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.set(0, 0.95 * hScale, -0.1);
        hair.userData = { isHair: true };
        silGroup.add(hair);
        // 前髪
        const bangsGeo = new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI, 0, Math.PI * 0.35);
        const bangsMat = new THREE.MeshBasicMaterial({
            color: darkColor, side: THREE.DoubleSide,
        });
        const bangs = new THREE.Mesh(bangsGeo, bangsMat);
        bangs.position.set(0, 1.48 * hScale, 0.06);
        bangs.rotation.x = 0.2;
        silGroup.add(bangs);
    } else if (hairStyle === 1) {
        // ツインテール（長めのリボン付き）
        for (let side = -1; side <= 1; side += 2) {
            const tailGeo = new THREE.CylinderGeometry(0.08, 0.025, 0.65 * hScale, 8);
            const tailMat = new THREE.MeshPhongMaterial({
                color: darkColor,
                emissive: memberColor, emissiveIntensity: 0.1,
            });
            const tail = new THREE.Mesh(tailGeo, tailMat);
            tail.position.set(side * 0.22, 1.05 * hScale, -0.05);
            tail.rotation.z = side * 0.35;
            tail.userData = { isHair: true };
            silGroup.add(tail);
            // リボン
            const ribbonGeo = new THREE.OctahedronGeometry(0.06, 0);
            const ribbonMat = new THREE.MeshBasicMaterial({
                color: brighterColor,
            });
            const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
            ribbon.position.set(side * 0.22, 1.35 * hScale, -0.05);
            ribbon.scale.set(1.5, 0.8, 0.5);
            silGroup.add(ribbon);
        }
    } else if (hairStyle === 2) {
        // ボブヘア（おしゃれカット風）
        const bobGeo = new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.65);
        const bobMat = new THREE.MeshPhongMaterial({
            color: darkColor,
            side: THREE.DoubleSide, emissive: memberColor, emissiveIntensity: 0.1,
        });
        const bob = new THREE.Mesh(bobGeo, bobMat);
        bob.position.set(0, 1.35 * hScale, -0.03);
        bob.userData = { isHair: true };
        silGroup.add(bob);
    } else {
        // ポニーテール（高い位置で束ねて後ろに揺れる）
        const tailGeo = new THREE.CylinderGeometry(0.09, 0.03, 0.7 * hScale, 8);
        const tailMat = new THREE.MeshPhongMaterial({
            color: darkColor,
            emissive: memberColor, emissiveIntensity: 0.1,
        });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.set(0, 1.15 * hScale, -0.12);
        tail.rotation.x = 0.4;
        tail.userData = { isHair: true };
        silGroup.add(tail);
        // ヘアバンド
        const bandGeo = new THREE.TorusGeometry(0.21, 0.015, 8, 16, Math.PI);
        const bandMat = new THREE.MeshBasicMaterial({
            color: brighterColor,
        });
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.set(0, 1.48 * hScale, 0);
        band.rotation.x = -0.2;
        silGroup.add(band);
    }

    // === 腕（左右・マイクを持つ手 + サイリウムを振る手）===
    for (let arm = -1; arm <= 1; arm += 2) {
        const armGroup = new THREE.Group();
        // 上腕
        const upperArmGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.35 * hScale, 8);
        const upperArmMat = new THREE.MeshPhongMaterial({
            color: memberColor,
            emissive: memberColor, emissiveIntensity: 0.15,
        });
        const upperArm = new THREE.Mesh(upperArmGeo, upperArmMat);
        upperArm.position.y = -0.15;
        armGroup.add(upperArm);
        // 前腕
        const foreArmGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.3 * hScale, 8);
        const foreArmMat = new THREE.MeshPhongMaterial({
            color: memberColor,
            emissive: memberColor, emissiveIntensity: 0.15,
        });
        const foreArm = new THREE.Mesh(foreArmGeo, foreArmMat);
        foreArm.position.y = -0.33;
        armGroup.add(foreArm);
        // 手（小さい球）
        const handGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const handMat = new THREE.MeshBasicMaterial({
            color: memberColor,
        });
        const hand = new THREE.Mesh(handGeo, handMat);
        hand.position.y = -0.48;
        armGroup.add(hand);

        // 右手にマイク
        if (arm === 1) {
            const micGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6);
            const micMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
            const mic = new THREE.Mesh(micGeo, micMat);
            mic.position.y = -0.55;
            armGroup.add(mic);
            const micTop = new THREE.Mesh(
                new THREE.SphereGeometry(0.025, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
            );
            micTop.position.y = -0.64;
            armGroup.add(micTop);
        }

        armGroup.position.set(arm * 0.22, 1.05 * hScale, 0);
        armGroup.rotation.z = arm * 0.15;
        armGroup.userData = { isArm: true, armSide: arm };
        silGroup.add(armGroup);
    }

    // === メンバーカラーのオーラ（体を包む強めのグロー）===
    const auraGeo = new THREE.CylinderGeometry(0.4, 0.55, 2.0 * hScale, 14, 1, true);
    const auraMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.y = 0.7 * hScale;
    aura.userData = { isAura: true };
    silGroup.add(aura);

    // === 頭上のスターエフェクト（キラキラ星）===
    const starGeo = new THREE.OctahedronGeometry(0.08, 0);
    const starMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.y = 1.8 * hScale;
    star.userData = { isGlow: true };
    silGroup.add(star);

    // 星のハロー（大きめの光輪）
    const haloGeo = new THREE.RingGeometry(0.15, 0.28, 20);
    const haloMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 1.8 * hScale;
    halo.userData = { isHalo: true };
    silGroup.add(halo);

    // === 足元スポットライト（大きめ + 二重リング）===
    const spotGeo = new THREE.CircleGeometry(0.7, 20);
    const spotMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const spot = new THREE.Mesh(spotGeo, spotMat);
    spot.position.y = -0.44;
    spot.rotation.x = -Math.PI / 2;
    spot.userData = { isSpot: true };
    silGroup.add(spot);
    // スポットの外側リング
    const spotRingGeo = new THREE.RingGeometry(0.7, 0.85, 20);
    const spotRingMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const spotRing = new THREE.Mesh(spotRingGeo, spotRingMat);
    spotRing.position.y = -0.43;
    spotRing.rotation.x = -Math.PI / 2;
    silGroup.add(spotRing);

    // === ライトビーム（天井から降りてくるスポット光）===
    const beamGeo = new THREE.CylinderGeometry(0.02, 0.5, 6, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 2.5;
    beam.userData = { isBeam: true };
    silGroup.add(beam);

    // ポジション（広いV字フォーメーション + 前後差）
    const formation = i < 5 ? 'front' : 'back';
    const idx = i < 5 ? i : i - 5;
    const rowOffset = formation === 'front' ? 0 : -2.0; // 前後列の間隔を広く
    const spreadAngle = ((idx - 2) / 2.0) * 0.55; // 左右の広がりを大きく
    const fwdOffset = -Math.abs(idx - 2) * 0.5; // V字の前後差を大きく
    const baseRadius = formation === 'front' ? 8.0 : 6.5; // 半径を大幅拡大
    silGroup.position.set(
        Math.sin(spreadAngle) * baseRadius,
        -5.3,
        -7.5 + rowOffset + fwdOffset
    );
    silGroup.scale.setScalar(hScale);
    // シルエット内の全メッシュにrenderOrderを設定（GLBステージより前に描画）
    silGroup.traverse((child) => {
        if (child.isMesh || child.isSprite) {
            child.renderOrder = child.material && child.material.blending === THREE.AdditiveBlending ? 6 : 3;
        }
    });
    silGroup.userData = {
        isSilhouette: true,
        memberIndex: i,
        baseX: silGroup.position.x,
        baseY: silGroup.position.y,
        baseZ: silGroup.position.z,
        dancePhase: (i / silhouetteCount) * Math.PI * 2,
        danceStyle: Math.floor(Math.random() * 4),
        hairStyle: hairStyle,
        costume: costume,
    };
    stageGroup.add(silGroup);
    stageSilhouettes.push(silGroup);
}

// --- 花道（センターステージ + T字型）---
// メイン花道
const runwayGeo = new THREE.BoxGeometry(3.5, 0.18, 7);
const runwayMat = new THREE.MeshBasicMaterial({ color: 0x0d0d20 });
const runway = new THREE.Mesh(runwayGeo, runwayMat);
runway.position.set(0, -5.5, -2);
stageGroup.add(runway);

// T字の先端（センターステージ）
const centerStageGeo = new THREE.CylinderGeometry(2.5, 2.5, 0.18, 24);
const centerStageMat = new THREE.MeshBasicMaterial({ color: 0x0d0d20 });
const centerStage = new THREE.Mesh(centerStageGeo, centerStageMat);
centerStage.position.set(0, -5.5, 1.5);
stageGroup.add(centerStage);

// センターステージのリングライト
const ringGeo = new THREE.RingGeometry(2.3, 2.55, 32);
const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff1493,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
});
const ringLight = new THREE.Mesh(ringGeo, ringMat);
ringLight.rotation.x = -Math.PI / 2;
ringLight.position.set(0, -5.39, 1.5);
ringLight.userData = { isCenterRing: true };
stageGroup.add(ringLight);

// 花道のエッジライト（両サイド連続LED）
for (let side = -1; side <= 1; side += 2) {
    for (let seg = 0; seg < 8; seg++) {
        const segGeo = new THREE.BoxGeometry(0.06, 0.06, 0.8);
        const segMat = new THREE.MeshBasicMaterial({
            color: side < 0 ? 0xff1493 : 0x00bfff,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
        });
        const segMesh = new THREE.Mesh(segGeo, segMat);
        segMesh.position.set(side * 1.8, -5.39, 1.5 - seg * 0.95);
        segMesh.userData = { isRunwayLED: true, seg, side };
        stageGroup.add(segMesh);
    }
}

// --- コンサート煙・フォグエフェクト（ステージ上の雲）---

// ==================== ★★★ 超輝夜姫ステージ装飾 ★★★ ====================
// --- 金の鳥居アーチ（バックスクリーン両脇に3基）---
const toriiArches = [];
for (let i = 0; i < 3; i++) {
    const toriiGroup = new THREE.Group();
    const zPos = -12 - i * 1.5;
    const scale = 1 - i * 0.08;
    const goldColor = new THREE.Color().setHSL(0.1, 0.9, 0.55 + i * 0.05);
    // 柱2本
    for (let side = -1; side <= 1; side += 2) {
        const pillarGeo = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 12 * scale, 8);
        const pillarMat = new THREE.MeshBasicMaterial({ color: goldColor, transparent: true, opacity: 0.7 });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(side * (13 + i * 1.5), 0.5, zPos);
        toriiGroup.add(pillar);
    }
    // 笠木（上の横棒）
    const kasagiGeo = new THREE.BoxGeometry((27 + i * 3) * scale, 0.25 * scale, 0.35 * scale);
    const kasagiMat = new THREE.MeshBasicMaterial({ color: goldColor, transparent: true, opacity: 0.65 });
    const kasagi = new THREE.Mesh(kasagiGeo, kasagiMat);
    kasagi.position.set(0, 6.2 * scale, zPos);
    toriiGroup.add(kasagi);
    // 島木（2段目の横棒）
    const shimGeo = new THREE.BoxGeometry((25 + i * 3) * scale, 0.18 * scale, 0.3 * scale);
    const shimMat = new THREE.MeshBasicMaterial({ color: goldColor, transparent: true, opacity: 0.55 });
    const shim = new THREE.Mesh(shimGeo, shimMat);
    shim.position.set(0, 5.6 * scale, zPos);
    toriiGroup.add(shim);
    // 金のグロー
    const toriiGlow = new THREE.PointLight(0xffd700, 0, 6);
    toriiGlow.position.set(0, 6, zPos);
    toriiGroup.add(toriiGlow);

    stageGroup.add(toriiGroup);
    toriiArches.push(toriiGroup);
}

// --- 和風灯籠（ステージ左右に浮遊）---
const lanterns = [];
for (let i = 0; i < 12; i++) {
    const lGroup = new THREE.Group();
    // 灯籠本体
    const bodyGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.8, 6);
    const bodyMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.08, 0.7, 0.6),
    });
    lGroup.add(new THREE.Mesh(bodyGeo, bodyMat));
    // 灯り（内部グロー）
    const glowGeo2 = new THREE.SphereGeometry(0.2, 8, 8);
    const glowMat2 = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending,
    });
    lGroup.add(new THREE.Mesh(glowGeo2, glowMat2));
    // 屋根
    const roofGeo = new THREE.ConeGeometry(0.4, 0.3, 6);
    const roofMat = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 0.55;
    lGroup.add(roof);

    const side = i % 2 === 0 ? -1 : 1;
    const baseX = side * (8 + Math.random() * 12);
    const baseY = 1 + Math.random() * 10;
    const baseZ = -20 + Math.random() * 35;
    lGroup.position.set(baseX, baseY, baseZ);
    lGroup.userData = { isLantern: true, baseX, baseY, baseZ, phase: Math.random() * Math.PI * 2 };
    stageGroup.add(lGroup);
    lanterns.push(lGroup);
}

// --- 桜吹雪パーティクル ---
const stageSakuraCount = 120;
const stageSakuraGeo = new THREE.BufferGeometry();
const stageSakuraPos = new Float32Array(stageSakuraCount * 3);
const stageSakuraVel = [];
for (let i = 0; i < stageSakuraCount; i++) {
    stageSakuraPos[i * 3] = (Math.random() - 0.5) * 60;
    stageSakuraPos[i * 3 + 1] = Math.random() * 24 - 4;
    stageSakuraPos[i * 3 + 2] = -25 + Math.random() * 55;
    stageSakuraVel.push({
        x: (Math.random() - 0.5) * 0.01,
        y: -0.005 - Math.random() * 0.008,
        z: (Math.random() - 0.5) * 0.005,
        spin: Math.random() * 0.02,
    });
}
stageSakuraGeo.setAttribute('position', new THREE.BufferAttribute(stageSakuraPos, 3));
const stageSakuraMat = new THREE.PointsMaterial({
    size: 0.1,
    color: 0xffb7c5,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
const stageSakuraParticles = new THREE.Points(stageSakuraGeo, stageSakuraMat);
stageGroup.add(stageSakuraParticles);

// --- 金粉パーティクル（キラキラ舞う）---
const goldDustCount = 80;
const goldGeo = new THREE.BufferGeometry();
const goldPos = new Float32Array(goldDustCount * 3);
for (let i = 0; i < goldDustCount; i++) {
    goldPos[i * 3] = (Math.random() - 0.5) * 55;
    goldPos[i * 3 + 1] = Math.random() * 18 - 4;
    goldPos[i * 3 + 2] = -22 + Math.random() * 50;
}
goldGeo.setAttribute('position', new THREE.BufferAttribute(goldPos, 3));
const goldMat = new THREE.PointsMaterial({
    size: 0.05,
    color: 0xffd700,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
const goldDust = new THREE.Points(goldGeo, goldMat);
stageGroup.add(goldDust);

// --- レーザー網（X字型のクロスビーム 8本）---
const laserBeams = [];
for (let i = 0; i < 8; i++) {
    const laserGeo = new THREE.CylinderGeometry(0.02, 0.02, 30, 4);
    const hue = i / 8;
    const laserMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 1, 0.6),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.set(0, 6, -10);
    laser.userData = { isLaser: true, idx: i, phase: i * Math.PI / 4 };
    stageGroup.add(laser);
    laserBeams.push(laser);
}

// --- 浮遊する蓮の花（センターステージ周辺）---
const lotusFlowers = [];
for (let i = 0; i < 6; i++) {
    const lotusGroup = new THREE.Group();
    // 花びら（5枚）
    for (let p = 0; p < 5; p++) {
        const petalGeo = new THREE.SphereGeometry(0.3, 6, 4);
        petalGeo.scale(1, 0.3, 1.8);
        const petalMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0.92 + p * 0.02, 0.7, 0.7),
            transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending,
        });
        const petal = new THREE.Mesh(petalGeo, petalMat);
        const angle = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(angle) * 0.3, 0, Math.sin(angle) * 0.3);
        petal.rotation.y = angle;
        petal.rotation.x = 0.3;
        lotusGroup.add(petal);
    }
    // 中心のグロー
    const coreGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffd700, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending,
    });
    lotusGroup.add(new THREE.Mesh(coreGeo, coreMat));

    const lAngle = (i / 6) * Math.PI * 2;
    const lRadius = 5 + Math.random() * 12;
    lotusGroup.position.set(
        Math.cos(lAngle) * lRadius,
        -3 + Math.random() * 10,
        -10 + Math.sin(lAngle) * lRadius * 0.6
    );
    lotusGroup.userData = {
        isLotus: true, phase: Math.random() * Math.PI * 2,
        orbitRadius: lRadius, orbitAngle: lAngle, baseY: lotusGroup.position.y,
    };
    stageGroup.add(lotusGroup);
    lotusFlowers.push(lotusGroup);
}

// --- 天蓋の金の紗幕（上部に半透明のカーテン風）---
const veilGeo = new THREE.PlaneGeometry(30, 3, 20, 1);
const veilMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    transparent: true, opacity: 0.04,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
});
const veilLeft = new THREE.Mesh(veilGeo, veilMat.clone());
veilLeft.position.set(0, 9, -10);
stageGroup.add(veilLeft);
const veilRight = new THREE.Mesh(veilGeo, veilMat.clone());
veilRight.position.set(0, 8.5, -12);
veilRight.rotation.y = 0.1;
stageGroup.add(veilRight);

// ==================== END 超輝夜姫装飾 ====================

const fogParticleCount = 30;
const fogGeo = new THREE.BufferGeometry();
const fogPositions = new Float32Array(fogParticleCount * 3);
const fogSizes = new Float32Array(fogParticleCount);
for (let i = 0; i < fogParticleCount; i++) {
    fogPositions[i * 3] = (Math.random() - 0.5) * 50;
    fogPositions[i * 3 + 1] = -5 + Math.random() * 3;
    fogPositions[i * 3 + 2] = -20 + Math.random() * 40;
    fogSizes[i] = Math.random() * 3 + 1;
}
fogGeo.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));
const fogMat = new THREE.PointsMaterial({
    size: 1.8,
    color: 0xaabbee,
    transparent: true,
    opacity: 0.03,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
const fogParticles = new THREE.Points(fogGeo, fogMat);
stageGroup.add(fogParticles);

// --- 花火エフェクトシステム ---
function createFirework(x, y, z, color) {
    const count = 40;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = 0.04 + Math.random() * 0.08;
        velocities.push({
            x: Math.sin(phi) * Math.cos(theta) * speed,
            y: Math.sin(phi) * Math.sin(theta) * speed,
            z: Math.cos(phi) * speed,
        });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.08,
        color: color,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const fw = new THREE.Points(geo, mat);
    fw.userData = { velocities, life: 1.0, decay: 0.015 + Math.random() * 0.01 };
    stageGroup.add(fw);
    stageFireworks.push(fw);
}

// --- 観客席（アリーナ風の扇形パーティクル大増量 + 華やかペンライト）---
// 既存のpenlightParticlesを補完する追加の観客光（大幅増量）
const arenaExtraCount = 2000;
const arenaGeo = new THREE.BufferGeometry();
const arenaPos = new Float32Array(arenaExtraCount * 3);
const arenaCol = new Float32Array(arenaExtraCount * 3);
for (let i = 0; i < arenaExtraCount; i++) {
    const angle = (Math.random() - 0.5) * Math.PI * 1.3;
    const dist = 4 + Math.random() * 18;
    const tier = Math.floor(Math.random() * 8);
    arenaPos[i * 3] = Math.sin(angle) * dist;
    arenaPos[i * 3 + 1] = -5 + tier * 1.0 + (Math.random() - 0.5) * 0.6;
    arenaPos[i * 3 + 2] = 2 + Math.cos(angle) * dist * 0.4 + tier * 1.3;
    const c = penlightColors[Math.floor(Math.random() * penlightColors.length)];
    arenaCol[i * 3] = c.r;
    arenaCol[i * 3 + 1] = c.g;
    arenaCol[i * 3 + 2] = c.b;
}
arenaGeo.setAttribute('position', new THREE.BufferAttribute(arenaPos, 3));
arenaGeo.setAttribute('color', new THREE.BufferAttribute(arenaCol, 3));
const arenaMat = new THREE.PointsMaterial({
    size: 0.04,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
const arenaParticles = new THREE.Points(arenaGeo, arenaMat);
stageGroup.add(arenaParticles);

// ==================== 観客エリア（ペンライト半円+巨大ユーザー）====================

// --- 観客ペンライト（半円周上にグロー球として配置 - 300本に増量）---
const audiencePenlights = [];
const audiencePLCount = 300;
for (let i = 0; i < audiencePLCount; i++) {
    const angle = (Math.random() - 0.5) * Math.PI * 1.1;
    const dist = 3 + Math.random() * 20;
    const tier = Math.floor(Math.random() * 8);
    const x = Math.sin(angle) * dist;
    const y = -5 + tier * 0.9 + Math.random() * 0.5;
    const z = 2 + Math.cos(angle) * dist * 0.35 + tier * 1.0;
    const plColor = penlightColors[Math.floor(Math.random() * penlightColors.length)];

    const plGroup = new THREE.Group();
    plGroup.position.set(x, y, z);

    // グロー球（メイン光源・大きめ）
    const glowSize = 0.06 + Math.random() * 0.08;
    const glowGeo = new THREE.SphereGeometry(glowSize, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: plColor, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 0.8;
    plGroup.add(glow);

    // 光のにじみ（大きい半透明球 + さらに大きい拡散）
    const haloGeo = new THREE.SphereGeometry(glowSize * 3.5, 8, 8);
    const haloMat = new THREE.MeshBasicMaterial({
        color: plColor, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.8;
    plGroup.add(halo);

    // さらに大きな拡散光（遠くからでも光の海に見える）
    const outerGlowGeo = new THREE.SphereGeometry(glowSize * 6, 6, 6);
    const outerGlowMat = new THREE.MeshBasicMaterial({
        color: plColor, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const outerGlow = new THREE.Mesh(outerGlowGeo, outerGlowMat);
    outerGlow.position.y = 0.8;
    plGroup.add(outerGlow);

    // 棒（細い半透明の持ち手）
    const stickGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.5, 3);
    const stickMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.15,
    });
    const stick = new THREE.Mesh(stickGeo, stickMat);
    stick.position.y = 0.45;
    plGroup.add(stick);

    plGroup.userData = {
        baseY: y,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 2.5,
        swingAmt: 0.2 + Math.random() * 0.4,
        glowMat: glowMat,
        haloMat: haloMat,
    };
    stageGroup.add(plGroup);
    audiencePenlights.push(plGroup);
}

// --- 巨大半透明ガラススクリーン（第4の壁 = PCモニター）---
const glassScreenGeo = new THREE.PlaneGeometry(44, 25);
const glassScreenMat = new THREE.MeshBasicMaterial({
    color: 0x99bbdd,
    transparent: true, opacity: 0.03,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
const glassScreen = new THREE.Mesh(glassScreenGeo, glassScreenMat);
glassScreen.position.set(0, 2, 24);
glassScreen.renderOrder = 8;
stageGroup.add(glassScreen);
// モニター枠（光るフレーム）
const glassFrameGeo = new THREE.EdgesGeometry(glassScreenGeo);
const glassFrameMat = new THREE.LineBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.12 });
const glassFrame = new THREE.LineSegments(glassFrameGeo, glassFrameMat);
glassFrame.position.copy(glassScreen.position);
stageGroup.add(glassFrame);

// --- 巨大ユーザー（画像テクスチャで覗き込むシルエット）---
const userTexLoader = new THREE.TextureLoader();
const userPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 24),
    new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.NormalBlending,
    })
);
userPlane.position.set(0, 3, 30);
userPlane.renderOrder = 9;
stageGroup.add(userPlane);
// テクスチャ読み込み
userTexLoader.load('figure/user_from_stage.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    userPlane.material.map = tex;
    userPlane.material.needsUpdate = true;
}, undefined, () => {
    // 画像読み込み失敗時は半透明シルエットで代替
    userPlane.material.color.set(0x445566);
    userPlane.material.opacity = 0.1;
});
// ユーザー周辺の画面光グロー
const userGlow = new THREE.PointLight(0x6688cc, 0.8, 30);
userGlow.position.set(0, 5, 28);
stageGroup.add(userGlow);

// --- 従来ステージ構造物にフォールバックタグを付与 ---
// GLBロード成功時にこれらを非表示にする
const fallbackChildCount = stageGroup.children.length; // GLBロード前の子要素数を記録

// --- GLBモデルローダー ---
if (USE_GLB_STAGE) {
    const gltfLoader = new GLTFLoader();
    // ローディングプログレス表示
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'glb-loading';
    loadingOverlay.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:12px 28px;border-radius:24px;font-size:13px;z-index:9999;pointer-events:none;transition:opacity 0.8s;font-family:sans-serif;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);';
    loadingOverlay.textContent = 'ステージモデル読み込み中...';
    document.body.appendChild(loadingOverlay);

    gltfLoader.load(
        'models/LiveStage.glb',
        (gltf) => {
            glbStageModel = gltf.scene;
            // モデルのスケールと位置を調整（既存シーンに合わせる）
            glbStageModel.scale.set(4.0, 4.0, 4.0);
            glbStageModel.position.set(0, -5.8, -7);

            // マテリアル調整（ライブ会場風の雰囲気）
            glbStageModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.side = THREE.DoubleSide;
                    const name = child.name || '';
                    const nameLower = name.toLowerCase();

                    // === 視界を遮るメッシュを処理 ===
                    // 壁: 非表示（カメラの視界を完全に塞ぐ）
                    if (name === 'A_02_Wall') {
                        child.visible = false;
                        return;
                    }
                    // 天井: 非表示（上からの俯瞰や天井スクリーンが見えなくなる）
                    if (name === 'A_02_Ceiling') {
                        child.visible = false;
                        return;
                    }
                    // フェンス: 半透明ワイヤーフレーム風（前方視界を確保）
                    if (name === 'A_05_Fence') {
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0x333355,
                            transparent: true,
                            opacity: 0.15,
                            wireframe: true,
                            depthWrite: true,
                        });
                        child.renderOrder = 1;
                        return;
                    }
                    // 天井鉄骨: メタリック風半透明（構造は見せつつ邪魔しない）
                    if (name === 'A_07_Celing_Iron') {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x445566,
                            transparent: true,
                            opacity: 0.35,
                            metalness: 0.8,
                            roughness: 0.3,
                            depthWrite: true,
                            side: THREE.DoubleSide,
                        });
                        child.renderOrder = 1;
                        return;
                    }
                    // スタンドボード（観客席の壁面）: 半透明
                    if (name === 'A_03_StandBoard') {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x1a1a40,
                            transparent: true,
                            opacity: 0.5,
                            roughness: 0.6,
                            metalness: 0.3,
                            emissive: new THREE.Color(0x1a1a40),
                            emissiveIntensity: 0.2,
                            side: THREE.DoubleSide,
                            depthWrite: true,
                        });
                        child.renderOrder = 0;
                        glbStageMeshes.push(child);
                        return;
                    }

                    // A_04_Light照明器具: SpotLightの光源として使用
                    if (name === 'A_04_Light01' || name === 'A_04_Light02' || name === 'A_04_Light01_Emit' || name === 'A_04_Light02_Emit') {
                        // 照明器具メッシュ自体を発光させる
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0xff69b4,
                            transparent: true,
                            opacity: 0.9,
                            blending: THREE.AdditiveBlending,
                            depthWrite: false,
                        });
                        child.renderOrder = 5;

                        // Emit系ノードからSpotLightを生成（照明器具から下向きにビームを出す）
                        if (name.includes('Emit')) {
                            // GLBメッシュのバウンディングボックスからワールド座標を計算
                            child.geometry.computeBoundingBox();
                            const bbox = child.geometry.boundingBox;
                            const centerX = (bbox.min.x + bbox.max.x) / 2;
                            const centerY = bbox.min.y;
                            const centerZ = (bbox.min.z + bbox.max.z) / 2;

                            // 照明器具の範囲に沿って複数のSpotLightを配置
                            const lightCount = name.includes('01') ? 5 : 3; // Light01は大きいので5個、Light02は3個
                            const xSpread = (bbox.max.x - bbox.min.x) * 0.7;
                            for (let li = 0; li < lightCount; li++) {
                                const t = lightCount > 1 ? (li / (lightCount - 1)) - 0.5 : 0;
                                const spot = new THREE.SpotLight(0xff69b4, 0.3, 50, Math.PI / 6, 0.5, 1.5);
                                // GLBモデルのスケール(4)とオフセット(0, -5.8, -7)を考慮
                                spot.position.set(
                                    (centerX + t * xSpread) * 4,
                                    centerY * 4 - 5.8,
                                    centerZ * 4 - 7
                                );
                                // ステージ床に向けてビームを出す
                                const targetObj = new THREE.Object3D();
                                targetObj.position.set(
                                    (centerX + t * xSpread) * 4 + (Math.random() - 0.5) * 2,
                                    -5.8,
                                    centerZ * 4 - 7 + 3
                                );
                                scene.add(targetObj);
                                spot.target = targetObj;
                                spot.userData = {
                                    baseTargetX: targetObj.position.x,
                                    baseTargetZ: targetObj.position.z,
                                    lightIndex: glbSpotLights.length,
                                };
                                scene.add(spot);
                                glbSpotLights.push(spot);
                            }
                        }
                        return;
                    }

                    // A_04_Audio（スピーカー等）: メタリック暗色
                    if (name === 'A_04_Audio') {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x222244,
                            roughness: 0.5,
                            metalness: 0.7,
                            side: THREE.DoubleSide,
                        });
                        child.renderOrder = 0;
                        return;
                    }

                    // B_StickLight（観客ペンライト）: アディティブブレンドで光らせる + 変数に保存
                    if (name.startsWith('B_') && nameLower.includes('stick')) {
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0xff69b4,
                            transparent: true,
                            opacity: 0.85,
                            blending: THREE.AdditiveBlending,
                            depthWrite: false,
                        });
                        child.renderOrder = 5;
                        glbStickLights.push(child);
                    }
                    // Screen部分: エミッシブで発光感
                    else if (nameLower.includes('screen') || nameLower.includes('celling') || nameLower.includes('sticker')) {
                        // C06_Stage_Sticker はGLBの元テクスチャ（無関係画像）を置き換え
                        if (name === 'C06_Stage_Sticker') {
                            // 曲テーマカラーのグラデーションキャンバスで置き換え
                            const stickerCanvas = document.createElement('canvas');
                            stickerCanvas.width = 512; stickerCanvas.height = 256;
                            const sCtx = stickerCanvas.getContext('2d');
                            const grad = sCtx.createLinearGradient(0, 0, 512, 256);
                            grad.addColorStop(0, '#1a0a2e');
                            grad.addColorStop(0.3, '#2d1b69');
                            grad.addColorStop(0.5, '#ff69b4');
                            grad.addColorStop(0.7, '#2d1b69');
                            grad.addColorStop(1, '#1a0a2e');
                            sCtx.fillStyle = grad;
                            sCtx.fillRect(0, 0, 512, 256);
                            sCtx.font = 'bold 60px Poppins, sans-serif';
                            sCtx.fillStyle = 'rgba(255,255,255,0.6)';
                            sCtx.textAlign = 'center';
                            sCtx.textBaseline = 'middle';
                            sCtx.fillText('=LOVE', 256, 128);
                            const stickerTex = new THREE.CanvasTexture(stickerCanvas);
                            stickerTex.flipY = false;
                            child.material = new THREE.MeshBasicMaterial({
                                map: stickerTex,
                                side: THREE.DoubleSide,
                            });
                            glbStageMeshes.push(child); // テーマカラー連動用
                        } else {
                            if (child.material.color) {
                                child.material.emissive = child.material.color.clone();
                                child.material.emissiveIntensity = 0.5;
                            }
                        }
                        child.renderOrder = 2;
                    }
                    // D_Emit系（発光装飾）: アディティブで明るく光らせる
                    else if (name.startsWith('D_')) {
                        child.material = new THREE.MeshBasicMaterial({
                            color: child.material.color ? child.material.color.clone() : new THREE.Color(0x8866cc),
                            transparent: true,
                            opacity: 0.85,
                            blending: THREE.AdditiveBlending,
                            depthWrite: false,
                        });
                        child.renderOrder = 4;
                    }
                    // ステージ本体(A_01_Main, A_02_Floor, A_06_Truss等): ダークパープル＋メタリック光沢
                    else if (name.startsWith('A_')) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x1a1a40,
                            roughness: 0.4,
                            metalness: 0.6,
                            emissive: new THREE.Color(0x1a1a40),
                            emissiveIntensity: 0.3,
                            side: THREE.DoubleSide,
                        });
                        child.renderOrder = 0;
                        glbStageMeshes.push(child);
                    }
                }
            });

            stageGroup.add(glbStageModel);

            // GLBモデル内のスクリーンメッシュを探して写真システムと連携
            glbStageModel.traverse((child) => {
                if (child.isMesh) {
                    const name = child.name || '';
                    if (name === 'C01_Screen_Back') {
                        glbBackScreen = child;
                        child.renderOrder = 2;
                    }
                    if (name === 'C02_Screen_Front01' || name === 'C03_Screen_Front02') {
                        glbFrontScreens.push(child);
                        child.renderOrder = 2;
                    }
                    if (name === 'C04_Screen_Celling_01' || name === 'C05_Sticker_Celling') {
                        glbCeilingScreens.push(child);
                        child.renderOrder = 2;
                    }
                }
            });

            // GLBスクリーンにバックスクリーン写真を反映
            if (glbBackScreen) {
                loadScreenPhoto(0).then(tex => {
                    if (tex) {
                        // GLBモデルのUVに合わせてテクスチャを上下反転
                        tex.flipY = false;
                        tex.needsUpdate = true;
                        glbBackScreen.material = new THREE.MeshBasicMaterial({
                            map: tex,
                            side: THREE.DoubleSide,
                        });
                        glbFrontScreens.forEach(fs => {
                            const fsTex = tex.clone();
                            fsTex.flipY = false;
                            fsTex.needsUpdate = true;
                            fs.material = new THREE.MeshBasicMaterial({
                                map: fsTex,
                                side: THREE.DoubleSide,
                            });
                        });
                        glbCeilingScreens.forEach(cs => {
                            const csTex = tex.clone();
                            csTex.flipY = false;
                            csTex.needsUpdate = true;
                            cs.material = new THREE.MeshBasicMaterial({
                                map: csTex,
                                side: THREE.DoubleSide,
                                transparent: false,
                            });
                        });
                    }
                });
            }

            // 従来の構造物を非表示に（GLBモデルが代替）
            // シルエットキャラクターは残す
            for (let i = 0; i < fallbackChildCount; i++) {
                const child = stageGroup.children[i];
                if (!child) continue;
                // シルエットは残す
                if (stageSilhouettes.includes(child)) continue;
                child.visible = false;
            }

            // ローディング完了
            loadingOverlay.textContent = 'ステージモデル読み込み完了！';
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.remove(), 1200);
            console.log('GLB Live Stage loaded successfully');
            glbStageModel.traverse((child) => {
                if (child.isMesh) console.log('  GLB Mesh:', child.name);
            });
        },
        (progress) => {
            if (progress.total > 0) {
                const pct = Math.round((progress.loaded / progress.total) * 100);
                loadingOverlay.textContent = `ステージモデル読み込み中... ${pct}%`;
            }
        },
        (error) => {
            console.warn('GLB model load failed, using fallback programmatic stage:', error);
            loadingOverlay.textContent = 'モデル読み込み失敗';
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.remove(), 2000);
        }
    );
}

// renderOrderはGLBローダー内で個別メッシュに設定済み（構造体:0, フェンス/鉄骨:1, スクリーン:2, シルエット:3, D_Emit/エフェクト:4-5）
scene.add(stageGroup);

// ==================== ANIMATION LOOP ====================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    // Smooth mouse
    mouse.x += (mouse.targetX - mouse.x) * 0.06;
    mouse.y += (mouse.targetY - mouse.y) * 0.06;

    const scrollFactor = scrollY * 0.0003;
    const scrollProgress = getScrollParallax();

    // ===== BACKGROUND SHADER =====
    bgShaderMat.uniforms.uTime.value = elapsed;
    bgShaderMat.uniforms.uMouse.value.set(
        mouse.rawX / window.innerWidth,
        1.0 - mouse.rawY / window.innerHeight
    );
    bgShaderMat.uniforms.uScroll.value = scrollProgress;
    bgShaderMat.uniforms.uBeat.value = musicBeat;
    // 曲テーマティントをシェーダーに反映
    if (currentSongTheme) {
        const st = currentSongTheme.shaderTint;
        bgShaderMat.uniforms.uSongTint.value.set(st[0], st[1], st[2]);
        bgShaderMat.uniforms.uLiveIntensity.value += (1.0 - bgShaderMat.uniforms.uLiveIntensity.value) * 0.05;
    } else {
        bgShaderMat.uniforms.uLiveIntensity.value *= 0.95;
    }

    // ===== 現在の曲テーマ（全セクションで使用） =====
    const theme = currentSongTheme || defaultTheme;
    const liveBoost = isMusicPlaying ? theme.intensity : 0;

    // ===== SAKURA PETALS — ライブ中は舞い散る =====
    sakuraPetals.forEach(petal => {
        const ud = petal.userData;
        const liveMul = 1 + musicBeat * 5 * liveBoost;
        petal.position.y -= ud.fallSpeed * liveMul;
        petal.position.x = ud.startX + Math.sin(elapsed * ud.swaySpeed * liveMul + petal.position.y) * ud.swayAmount * (8 + musicBeat * 15);
        petal.rotation.x += ud.rotSpeedX * liveMul;
        petal.rotation.y += ud.rotSpeedY * liveMul;
        petal.rotation.z += ud.rotSpeedZ * liveMul;
        // ライブ中は不透明度アップ
        petal.material.opacity = petal.material.opacity * 0.95 + (isMusicPlaying ? 0.4 + musicBeat * 0.3 : 0.2) * 0.05;

        if (petal.position.y < -12) {
            petal.position.y = 12 + Math.random() * 5;
            petal.position.x = (Math.random() - 0.5) * 25;
            ud.startX = petal.position.x;
        }
    });

    // ===== AURORA RIBBONS — 5フレームに1回だけジオメトリ更新 =====
    const ribbonFrame = Math.floor(elapsed * 60);
    ribbons.forEach((ribbon, rIdx) => {
        ribbon.material.uniforms.uTime.value = elapsed;
        ribbon.material.uniforms.uBeat.value = musicBeat * (isMusicPlaying ? theme.intensity : 1);

        // ジオメトリ再生成は5フレームに1回（GC圧力を80%削減）
        if ((ribbonFrame + rIdx) % 5 !== 0) return;
        const ud = ribbon.userData;
        const ampMul = 1 + (isMusicPlaying ? musicBeat * 3 * liveBoost : 0);
        const newPoints = ud.basePoints.map((p, i) => {
            return new THREE.Vector3(
                p.x,
                p.y + Math.sin(elapsed * ud.speed * (1 + liveBoost * 0.5) + i * 0.15 + ud.phaseOffset) * ud.amplitude * ampMul +
                      Math.sin(elapsed * ud.speed * 0.7 + i * 0.08) * ud.amplitude * 0.3 * ampMul,
                p.z + Math.cos(elapsed * ud.speed * 0.5 + i * 0.1) * (0.3 + musicBeat * 0.8)
            );
        });
        const newCurve = new THREE.CatmullRomCurve3(newPoints);
        const newGeo = new THREE.TubeGeometry(newCurve, 50, 0.03 + musicBeat * 0.05, 6, false);
        ribbon.geometry.dispose();
        ribbon.geometry = newGeo;
    });

    // ===== PENLIGHT PARTICLES — ウェーブモード対応 + 曲テーマ同期 =====
    const plPosArr = penlightGeo.attributes.position.array;
    const plColArr = penlightGeo.attributes.color.array;
    const bpmFactor = currentSongTheme ? currentSongTheme.bpm / 120.0 : 1.0;

    for (let i = 0; i < penlightCount; i++) {
        const i3 = i * 3;
        const waveX = plPosArr[i3];
        const wavePhase = plPhases[i];

        // 基本揺れ
        plPosArr[i3 + 1] += Math.sin(elapsed * 1.8 + waveX * 0.5 + wavePhase) * 0.001;
        plPosArr[i3] += Math.cos(elapsed * 0.3 + i * 0.002) * 0.0003;

        if (musicBeat > 0.1) {
            const swingIntensity = musicBeat * liveBoost;

            if (penlightMode) {
                // ウェーブモード別アニメーション
                switch (penlightWaveMode) {
                    case 'wave':
                        // ウェーブ：左から右に波打つ
                        const waveDelay = waveX * 0.4;
                        plPosArr[i3 + 1] += Math.sin(elapsed * 4.0 * bpmFactor + waveDelay) * swingIntensity * 0.015;
                        plPosArr[i3] += Math.cos(elapsed * 2.0 * bpmFactor + waveDelay) * swingIntensity * 0.006;
                        break;
                    case 'jump':
                        // ジャンプ：全員一斉に上下
                        const jumpPhase = Math.sin(elapsed * Math.PI * bpmFactor * 2);
                        plPosArr[i3 + 1] += Math.max(0, jumpPhase) * swingIntensity * 0.02;
                        plPosArr[i3] += Math.cos(elapsed * 6.0 + wavePhase) * swingIntensity * 0.003;
                        break;
                    case 'sync':
                        // シンク：全員同じ動き（左右振り）
                        const syncSwing = Math.sin(elapsed * Math.PI * bpmFactor * 2);
                        plPosArr[i3] += syncSwing * swingIntensity * 0.012;
                        plPosArr[i3 + 1] += Math.abs(Math.cos(elapsed * Math.PI * bpmFactor * 2)) * swingIntensity * 0.005;
                        break;
                }
            } else {
                // ペンライトモードOFFの通常ライブ振り
                plPosArr[i3 + 1] += Math.sin(elapsed * 6.0 + wavePhase) * swingIntensity * 0.008;
                plPosArr[i3] += Math.cos(elapsed * 4.0 + wavePhase * 2) * swingIntensity * 0.004;
            }
        }

        // 曲テーマに合わせてペンライトカラーを時々変更（AUTO時）
        if (penlightAutoColor && currentSongTheme && isMusicPlaying) {
            const colorCycle = Math.sin(elapsed * 0.5 + wavePhase * 0.3);
            const p = currentSongTheme.primary;
            const s = currentSongTheme.secondary;
            const mix = (colorCycle + 1) * 0.5; // 0〜1
            plColArr[i3] = p[0] * mix + s[0] * (1 - mix);
            plColArr[i3 + 1] = p[1] * mix + s[1] * (1 - mix);
            plColArr[i3 + 2] = p[2] * mix + s[2] * (1 - mix);
        }
    }
    if (penlightAutoColor && currentSongTheme && isMusicPlaying) {
        penlightGeo.attributes.color.needsUpdate = true;
    }

    // ペンライトモード + 強化ビジュアル
    if (penlightMode) {
        const comboBoost = Math.min(penlightCombo * 0.005, 0.3);
        penlightMat.size = 0.1 + Math.sin(elapsed * 4) * 0.03 + musicBeat * 0.08 + comboBoost;
        penlightMat.opacity = 0.9 + Math.sin(elapsed * 2) * 0.1;
    }
    // ライブ中はペンライトが明るく大きく
    if (isMusicPlaying) {
        penlightMat.size = Math.max(penlightMat.size, 0.04 + musicBeat * 0.1);
        penlightMat.opacity = Math.max(penlightMat.opacity, 0.6 + musicBeat * 0.3);
    }
    penlightGeo.attributes.position.needsUpdate = true;
    penlightParticles.rotation.y = elapsed * 0.012 + mouse.x * 0.15 + scrollFactor;
    penlightParticles.rotation.x = mouse.y * 0.08 + scrollFactor * 0.15;

    // ===== EQUAL SIGN FORMATION =====
    if (equalFormed && equalFormProgress < 1) {
        equalFormProgress += 0.008;
        const t = Math.min(equalFormProgress, 1);
        const eased = 1 - Math.pow(1 - t, 4);
        const eqPosArr = equalGeo.attributes.position.array;
        for (let i = 0; i < equalParticleCount; i++) {
            const i3 = i * 3;
            eqPosArr[i3] += (eqOriginal[i3] - eqPosArr[i3]) * eased * 0.05;
            eqPosArr[i3 + 1] += (eqOriginal[i3 + 1] - eqPosArr[i3 + 1]) * eased * 0.05;
            eqPosArr[i3 + 2] += (eqOriginal[i3 + 2] - eqPosArr[i3 + 2]) * eased * 0.05;
        }
        equalGeo.attributes.position.needsUpdate = true;
    } else if (equalFormProgress >= 1) {
        const eqPosArr = equalGeo.attributes.position.array;
        for (let i = 0; i < equalParticleCount; i++) {
            const i3 = i * 3;
            eqPosArr[i3] = eqOriginal[i3] + Math.sin(elapsed * 0.8 + i * 0.05) * 0.025;
            eqPosArr[i3 + 1] = eqOriginal[i3 + 1] + Math.cos(elapsed * 0.6 + i * 0.03) * 0.018;
            // Music pulse — equal sign breathes with music
            if (musicBeat > 0.1) {
                const pulse = Math.sin(elapsed * 6.0 + i * 0.1) * musicBeat * 0.03;
                eqPosArr[i3] += pulse;
                eqPosArr[i3 + 1] += pulse * 0.5;
            }
        }
        equalGeo.attributes.position.needsUpdate = true;
    }
    equalMat.opacity = Math.max(0, 0.95 - scrollProgress * 3);
    equalParticles.position.y = -scrollY * 0.001;

    // ===== FLOATING HEARTS — ライブ中はドクンと脈打つ =====
    hearts3D.forEach((heart, idx) => {
        const ud = heart.userData;
        const beatMul = 1 + musicBeat * 3 * liveBoost;
        heart.rotation.x += ud.rotSpeed.x * beatMul;
        heart.rotation.y += ud.rotSpeed.y * beatMul;
        heart.rotation.z += ud.rotSpeed.z * beatMul;
        heart.position.y = ud.initialY + Math.sin(elapsed * ud.floatSpeed * beatMul) * ud.floatAmplitude;
        heart.position.x = ud.initialX + Math.sin(elapsed * ud.driftSpeed * beatMul) * (0.6 + musicBeat * 2);
        if (musicBeat > 0.1) {
            // ビートに合わせてドクンと膜らむ
            const baseScale = heart.scale.x;
            const targetScale = baseScale * (1.0 + musicBeat * 0.5 * liveBoost);
            heart.scale.setScalar(baseScale * 0.85 + targetScale * 0.15);
            // ライブ中は不透明度アップ
            heart.material.opacity = Math.min(0.3, heart.material.opacity + musicBeat * 0.01);
        }
    });

    // ===== CONCERT LIGHTING RAYS — 曲テーマで色が変わる =====
    raysArr.forEach((ray, i) => {
        const ud = ray.userData;
        const speedMul = 1 + musicBeat * 4 * liveBoost;
        ray.rotation.z += ud.rotSpeed * speedMul;
        ray.position.x = ud.initialX + Math.sin(elapsed * ud.swaySpeed * speedMul) * ud.swayAmount * (3 + musicBeat * 5);
        const baseOp = ud.baseOpacity + Math.sin(elapsed * 0.8 + i) * 0.015;
        ray.material.opacity = baseOp * (penlightMode ? 3.5 : 1) * (1 + musicBeat * 8 * liveBoost);
        // 曲テーマカラー適用
        if (isMusicPlaying && currentSongTheme) {
            const tc = i % 2 === 0 ? theme.primary : theme.secondary;
            ray.material.color.setRGB(
                ray.material.color.r * 0.9 + tc[0] * 0.1,
                ray.material.color.g * 0.9 + tc[1] * 0.1,
                ray.material.color.b * 0.9 + tc[2] * 0.1
            );
        }
        const s = 1 + musicBeat * 0.6 * liveBoost;
        ray.scale.set(s, 1, s);
    });

    // ===== LASER BEAMS — 曲テーマ連動・爆速回転 =====
    const laserSpd = isMusicPlaying ? (theme.laserSpeed || 1.0) : 0.3;
    laserGroup.children.forEach((laser, i) => {
        const ud = laser.userData;
        laser.rotation.z = Math.sin(elapsed * ud.speed * laserSpd + ud.baseAngle) * (1.0 + musicBeat * 1.5);
        laser.rotation.x = Math.cos(elapsed * ud.speed * laserSpd * 0.5 + ud.baseAngle) * (0.4 + musicBeat * 0.8);
        const ambient = 0.04 + Math.sin(elapsed * 0.3 + ud.baseAngle) * 0.02;
        const boost = (isMusicPlaying ? musicBeat * 0.9 * liveBoost : 0) + (penlightMode ? 0.15 : 0);
        laser.material.opacity = ambient + boost;
        // 曲テーマカラーで色変化
        if (isMusicPlaying && currentSongTheme) {
            const mix = (Math.sin(elapsed * 0.5 + i * 0.8) * 0.5 + 0.5);
            laser.material.color.setRGB(
                theme.primary[0] * mix + theme.accent[0] * (1 - mix),
                theme.primary[1] * mix + theme.accent[1] * (1 - mix),
                theme.primary[2] * mix + theme.accent[2] * (1 - mix)
            );
            laser.material.color.multiplyScalar(0.6 + musicBeat * 0.8);
        } else {
            laser.material.color.setHSL((ud.hue + elapsed * 0.05) % 1, 1, 0.4 + musicBeat * 0.4);
        }
    });

    // ===== SPOTLIGHT CONES — 曲テーマで色とスウィング =====
    spotGroup.children.forEach((cone, i) => {
        const ud = cone.userData;
        const swingAmp = 2 + (isMusicPlaying ? musicBeat * 4 * liveBoost : 0);
        cone.position.x = (i - spotCount / 2) * 4 + Math.sin(elapsed * 0.4 * (1 + liveBoost) + ud.phaseOffset) * swingAmp;
        const ambient = 0.04 + Math.sin(elapsed * 0.5 + ud.phaseOffset) * 0.02;
        const boost = (isMusicPlaying ? musicBeat * 0.25 * liveBoost : 0) + (penlightMode ? 0.06 : 0);
        cone.material.opacity = ambient + boost;
        if (isMusicPlaying && currentSongTheme) {
            const tc = i % 3 === 0 ? theme.primary : i % 3 === 1 ? theme.secondary : theme.accent;
            cone.material.color.setRGB(tc[0], tc[1], tc[2]);
        } else {
            const cIdx = Math.floor((elapsed * 0.2 + ud.phaseOffset) % penlightColors.length);
            cone.material.color.copy(penlightColors[cIdx]);
        }
    });

    // ===== STROBE EFFECT — 曲テーマのstrobeChanceで頻度が変わる =====
    if (isMusicPlaying && musicBeat > 0.5) {
        const strobeThreshold = 1 - (theme.strobeChance || 0.3);
        strobeMat.opacity = Math.random() > strobeThreshold ? (0.5 + musicBeat * 0.5) : 0;
        // ストロボも曲テーマカラーに
        if (currentSongTheme) {
            const sc = theme.accent;
            strobeMat.color.setRGB(sc[0], sc[1], sc[2]);
        }
    } else if (penlightMode) {
        strobeMat.opacity = Math.random() > 0.9 ? 0.3 : strobeMat.opacity * 0.95;
        strobeMat.color.setRGB(1, 1, 1);
    } else {
        strobeMat.opacity *= 0.9;
    }

    // ===== SPARKLE TWINKLE — 音楽再生中は増量 =====
    sparkleMat.opacity = 0.25 + Math.sin(elapsed * 2.5) * 0.2 + (isMusicPlaying ? musicBeat * 0.4 : 0);
    sparkleMat.size = 0.045 + (isMusicPlaying ? musicBeat * 0.06 : 0);
    const sparklePos = sparkleGeo.attributes.position.array;
    for (let i = 0; i < sparkleCount; i++) {
        const i3 = i * 3;
        sparklePos[i3 + 1] += Math.sin(elapsed * 0.5 + i * 0.7) * 0.0008;
        // ライブ中は動きを激しく
        if (isMusicPlaying) {
            sparklePos[i3] += Math.sin(elapsed * 2.0 + i * 0.3) * musicBeat * 0.003;
            sparklePos[i3 + 1] += Math.cos(elapsed * 1.5 + i * 0.5) * musicBeat * 0.004;
        }
    }
    sparkleGeo.attributes.position.needsUpdate = true;

    // ===== GLB\u7167\u660e\u5668\u5177SpotLight\u30a2\u30cb\u30e1\u30fc\u30b7\u30e7\u30f3 =====
    glbSpotLights.forEach((sl, idx) => {
        if (isMusicPlaying && currentSongTheme) {
            const beatPulse = 0.5 + musicBeat * 2.0;
            sl.intensity = beatPulse;
            // 左右交互にカラーを切り替え
            if (idx % 2 === 0) {
                const p = currentSongTheme.primary;
                sl.color.setRGB(p[0], p[1], p[2]);
            } else {
                const a = currentSongTheme.accent || currentSongTheme.primary;
                sl.color.setRGB(a[0], a[1], a[2]);
            }
            // ビートに合わせて角度を揺らす
            const swayAngle = Math.sin(elapsed * 2 + idx * 1.5) * 0.3 * musicBeat;
            sl.target.position.x = sl.userData.baseTargetX + Math.sin(swayAngle + idx) * 4;
            sl.target.position.z = sl.userData.baseTargetZ + Math.cos(swayAngle + idx * 0.7) * 2;
            sl.target.updateMatrixWorld();
        } else {
            sl.intensity = 0.3;
            sl.color.set(0xff69b4);
        }
    });

    // ===== LYRIC TEXT PARTICLES — 音楽再生中はより目立つ & 動きが速い =====
    lyricParticles.forEach(sprite => {
        const ud = sprite.userData;
        const liveSpeedMul = isMusicPlaying ? (1 + musicBeat * 2) : 1;
        sprite.position.y = ud.initialY + Math.sin(elapsed * ud.floatSpeed * liveSpeedMul + ud.fadePhase) * ud.floatAmplitude * liveSpeedMul;
        sprite.position.x += ud.driftX * liveSpeedMul;
        const fade = Math.sin(elapsed * 0.3 + ud.fadePhase) * 0.5 + 0.5;
        sprite.material.opacity = ud.targetOpacity * fade * (1 + musicBeat * 4) * (isMusicPlaying ? 2.5 : 1);
        if (sprite.position.x > 12) sprite.position.x = -12;
        if (sprite.position.x < -12) sprite.position.x = 12;
    });

    // ===== 3D LIVE STAGE ANIMATION（大規模アリーナ演出）=====
    updateScreenPhoto(elapsed);

    // ムービングライト — BPM同期で回転・色変化・明滅
    stageMovingLights.forEach(ml => {
        const ud = ml.userData;
        const phase = ud.phase;
        const speed = isMusicPlaying ? (2.5 + musicBeat * 5.0) : 0.3;
        // ビートに合わせて明滅
        const baseBright = isMusicPlaying ? 0.5 + musicBeat * 0.5 : 0.12;
        ml.material.opacity = baseBright * (0.6 + Math.sin(elapsed * 4 + phase) * 0.4);
        // 曲テーマカラーに変化
        if (isMusicPlaying && currentSongTheme) {
            const mix = (Math.sin(elapsed * speed * 0.3 + phase) * 0.5 + 0.5);
            ml.material.color.setRGB(
                theme.primary[0] * mix + theme.accent[0] * (1 - mix),
                theme.primary[1] * mix + theme.accent[1] * (1 - mix),
                theme.primary[2] * mix + theme.accent[2] * (1 - mix)
            );
        } else {
            ml.material.color.setHSL((elapsed * 0.05 + phase * 0.16) % 1, 1, 0.65);
        }
    });

    // スポットライトビーム — ライブ中は激しく動く
    stageSpotBeams.forEach(beam => {
        const ud = beam.userData;
        const phase = ud.phase || 0;
        const liveSpeed = isMusicPlaying ? (1.5 + musicBeat * 3.0) : 0.2;
        beam.rotation.x = Math.sin(elapsed * liveSpeed * 0.4 + phase) * 0.2;
        beam.rotation.z = Math.sin(elapsed * liveSpeed * 0.3 + phase * 1.3) * (0.15 + musicBeat * 0.25);
        // ライブ中は不透明度UP
        const baseOp = isMusicPlaying ? 0.02 + musicBeat * 0.08 : 0;
        beam.material.opacity = baseOp * (0.5 + Math.sin(elapsed * 2 + phase) * 0.5);
        // 曲テーマカラー
        if (isMusicPlaying && currentSongTheme) {
            const mix = (Math.sin(elapsed * 0.6 + phase) * 0.5 + 0.5);
            beam.material.color.setRGB(
                theme.primary[0] * mix + theme.secondary[0] * (1 - mix),
                theme.primary[1] * mix + theme.secondary[1] * (1 - mix),
                theme.primary[2] * mix + theme.secondary[2] * (1 - mix)
            );
        }
    });

    // タワーライト — レベルごとに波打つ
    stageTowerLights.forEach(tl => {
        const ud = tl.userData;
        const baseBright = isMusicPlaying ? 0.4 + musicBeat * 0.6 : 0.12;
        tl.material.opacity = baseBright * (0.5 + Math.sin(elapsed * 3 + ud.phase) * 0.5);
        if (isMusicPlaying && currentSongTheme) {
            const tc = ud.side < 0 ? theme.primary : theme.secondary;
            const flash = Math.sin(elapsed * 6 + ud.phase) * 0.5 + 0.5;
            tl.material.color.setRGB(
                tc[0] * 0.7 + theme.accent[0] * 0.3 * flash,
                tc[1] * 0.7 + theme.accent[1] * 0.3 * flash,
                tc[2] * 0.7 + theme.accent[2] * 0.3 * flash
            );
        }
    });

    // スクリーンボーダーLED — レインボー走査
    screenBorders.forEach((border, i) => {
        const pulse = Math.sin(elapsed * 5 + i * Math.PI * 0.5) * 0.3 + 0.6;
        const beatBoost = isMusicPlaying ? musicBeat * 0.4 : 0;
        border.material.opacity = pulse + beatBoost;
        if (isMusicPlaying) {
            const hue = (elapsed * 0.15 + i * 0.25) % 1;
            border.material.color.setHSL(hue, 1, 0.55 + musicBeat * 0.3);
        }
    });

    // フロアLEDグリッド — 波打つグリッドパターン
    stageFloorLEDs.forEach(led => {
        const ud = led.userData;
        const wave = Math.sin(elapsed * 2 + ud.gridX * 0.5 + ud.gridZ * 0.3) * 0.5 + 0.5;
        const beatPulse = isMusicPlaying ? musicBeat * 0.15 : 0;
        led.material.opacity = 0.03 + wave * 0.06 + beatPulse;
        if (isMusicPlaying && currentSongTheme) {
            const hue = (ud.baseHue + elapsed * 0.05) % 1;
            led.material.color.setHSL(hue, 0.8, 0.4 + musicBeat * 0.3);
        }
    });

    // シルエットキャラクター — ダンスアニメーション（アイドル風・強化版）
    stageSilhouettes.forEach(sil => {
        const ud = sil.userData;
        const bpmFactor = currentSongTheme ? currentSongTheme.bpm / 140 : 1;
        const danceSpeed = isMusicPlaying ? bpmFactor * 3.0 : 0.5;
        const beatIntensity = isMusicPlaying ? musicBeat * liveBoost : 0;
        const baseY = ud.baseY || -5.3;

        // ダンススタイル別アニメーション
        if (ud.danceStyle === 0) {
            // バウンス（上下跳ねる・アイドルジャンプ）
            sil.position.y = baseY + Math.abs(Math.sin(elapsed * danceSpeed + ud.dancePhase)) * (0.12 + beatIntensity * 0.5);
            sil.rotation.y = Math.sin(elapsed * danceSpeed * 0.3 + ud.dancePhase) * 0.15;
        } else if (ud.danceStyle === 1) {
            // スウェイ（左右ステップ・体を傾ける）
            const sway = Math.sin(elapsed * danceSpeed * 0.7 + ud.dancePhase);
            sil.position.x = ud.baseX + sway * (0.25 + beatIntensity * 0.5);
            sil.position.y = baseY + Math.abs(Math.sin(elapsed * danceSpeed * 1.5 + ud.dancePhase)) * (0.08 + beatIntensity * 0.3);
            sil.rotation.z = sway * 0.1;
        } else if (ud.danceStyle === 2) {
            // ウェーブ（波打つ・回転しながら）
            sil.position.y = baseY + Math.sin(elapsed * danceSpeed + ud.dancePhase) * (0.1 + beatIntensity * 0.35);
            sil.rotation.y = Math.sin(elapsed * danceSpeed * 0.5 + ud.dancePhase) * (0.25 + beatIntensity * 0.5);
        } else {
            // スピン（サビでくるっと回転）
            sil.position.y = baseY + Math.abs(Math.sin(elapsed * danceSpeed * 1.2 + ud.dancePhase)) * (0.1 + beatIntensity * 0.35);
            if (beatIntensity > 0.4) {
                sil.rotation.y += beatIntensity * 0.18;
            } else {
                sil.rotation.y = Math.sin(elapsed * danceSpeed * 0.4 + ud.dancePhase) * 0.2;
            }
        }

        // 各パーツのアニメーション
        sil.children.forEach(child => {
            // 腕の振り（グループ化された腕）
            if (child.userData.isArm) {
                const armSwing = Math.sin(elapsed * danceSpeed * 1.2 + ud.dancePhase + child.userData.armSide * 0.5);
                child.rotation.z = child.userData.armSide * (0.2 + armSwing * (0.4 + beatIntensity * 0.9));
                // ビート時は腕を大きく上げる（コール風）
                if (beatIntensity > 0.3) {
                    child.rotation.z += child.userData.armSide * beatIntensity * 0.7;
                    child.rotation.x = Math.sin(elapsed * danceSpeed * 2 + ud.dancePhase) * beatIntensity * 0.35;
                }
            }
            // 頭上スター
            if (child.userData.isGlow) {
                child.material.opacity = 0.5 + musicBeat * 0.5;
                child.position.y = 1.8 + Math.sin(elapsed * danceSpeed + ud.dancePhase) * 0.15;
                child.scale.setScalar(0.8 + musicBeat * 0.7);
                child.rotation.y = elapsed * 3;
                child.rotation.z = elapsed * 1.5;
            }
            // ハロー
            if (child.userData.isHalo) {
                child.material.opacity = 0.15 + musicBeat * 0.45;
                child.position.y = 1.8 + Math.sin(elapsed * danceSpeed + ud.dancePhase) * 0.15;
                child.rotation.z = elapsed * 2;
            }
            // スカートの揺れ
            if (child.userData.isSkirt) {
                child.rotation.z = Math.sin(elapsed * danceSpeed * 0.8 + ud.dancePhase) * (0.06 + beatIntensity * 0.18);
                const skirtScale = 1.0 + Math.abs(Math.sin(elapsed * danceSpeed + ud.dancePhase)) * (0.06 + beatIntensity * 0.18);
                child.scale.set(skirtScale, 1, skirtScale);
            }
            // 髪の揺れ
            if (child.userData.isHair) {
                child.rotation.z = Math.sin(elapsed * danceSpeed * 0.6 + ud.dancePhase + 0.5) * (0.1 + beatIntensity * 0.25);
                child.rotation.x = Math.sin(elapsed * danceSpeed * 0.4 + ud.dancePhase) * 0.06;
            }
            // オーラ
            if (child.userData.isAura) {
                child.material.opacity = isMusicPlaying ? 0.15 + musicBeat * 0.25 : 0.08;
                child.rotation.y = elapsed * 0.5;
            }
            // 足元スポットライト
            if (child.userData.isSpot) {
                child.material.opacity = isMusicPlaying ? 0.2 + musicBeat * 0.35 : 0.12;
                const spotScale = 1.0 + musicBeat * 0.35;
                child.scale.set(spotScale, spotScale, 1);
            }
            // 天井からのビーム
            if (child.userData.isBeam) {
                child.material.opacity = isMusicPlaying ? 0.04 + musicBeat * 0.08 : 0.02;
                child.rotation.x = Math.sin(elapsed * 0.3 + ud.dancePhase) * 0.05;
            }
        });

        // メンバーカラーでの光り方（ライブ中は明るく）
        const brightness = isMusicPlaying ? 0.8 + musicBeat * 0.2 : 0.65;
        sil.children.forEach(child => {
            if (child.material && !child.userData.isGlow && !child.userData.isHalo && !child.userData.isAura && !child.userData.isSpot && !child.userData.isBeam) {
                child.material.opacity = brightness;
            }
        });
    });

    // GLBペンライト（観客StickLight）— 曲テーマカラー連動 + ビート脈動
    try {
    if (glbStickLights.length > 0) {
        const baseColor = currentSongTheme ? new THREE.Color(currentSongTheme.primary[0], currentSongTheme.primary[1], currentSongTheme.primary[2]) : new THREE.Color(0xff69b4);
        glbStickLights.forEach((sl, si) => {
            if (!sl.material) return;
            const phase = si * 0.7 + elapsed * 2.5;
            const pulse = isMusicPlaying ? 0.55 + musicBeat * 0.45 + Math.sin(phase) * 0.15 : 0.3 + Math.sin(phase * 0.3) * 0.1;
            sl.material.opacity = pulse;
            if (isMusicPlaying && currentSongTheme) {
                // ビート時に少し白く光る
                const flash = musicBeat > 0.5 ? musicBeat * 0.3 : 0;
                if (sl.material.color) {
                    sl.material.color.copy(baseColor).lerp(new THREE.Color(0xffffff), flash);
                }
            }
        });
    }

    // GLBステージ本体 — 曲テーマカラーでエミッシブ色変化 + 環境光連動
    if (glbStageMeshes.length > 0) {
        if (isMusicPlaying && currentSongTheme) {
            const sp = currentSongTheme.primary;
            const stageEmissive = new THREE.Color(sp[0], sp[1], sp[2]).multiplyScalar(0.15);
            glbStageMeshes.forEach(sm => {
                if (!sm.material || !sm.material.emissive) return;
                sm.material.emissive.lerp(stageEmissive, 0.08);
                sm.material.emissiveIntensity = 0.3 + musicBeat * 0.2;
            });
            // ステージ照明も曲テーマに連動（控えめに）
            const cp = currentSongTheme.primary;
            stageCenterSpot.color.setRGB(cp[0], cp[1], cp[2]);
            stageCenterSpot.intensity = 0.6 + musicBeat * 1.0;
            hemiLight.color.setRGB(cp[0], cp[1], cp[2]).multiplyScalar(0.3).add(new THREE.Color(0x221133));
            // 左右スポットもビートに連動
            stageLeftSpot.intensity = 0.2 + musicBeat * 0.5;
            stageRightSpot.intensity = 0.2 + musicBeat * 0.5;
            const la = currentSongTheme.accent || currentSongTheme.primary;
            stageLeftSpot.color.setRGB(la[0], la[1], la[2]);
            stageRightSpot.color.setRGB(cp[0], cp[1], cp[2]);
        } else {
            glbStageMeshes.forEach(sm => {
                if (sm.material) sm.material.emissiveIntensity = 0.25;
            });
            stageCenterSpot.intensity = 0.5;
            stageLeftSpot.intensity = 0.2;
            stageRightSpot.intensity = 0.2;
        }
    }
    } catch(glbErr) { /* GLBエフェクトのエラーでanimate停止を防止 */ }

    // センターステージリングライト
    if (ringLight) {
        const ringPulse = Math.sin(elapsed * 4) * 0.3 + 0.5;
        ringLight.material.opacity = (isMusicPlaying ? 0.5 + musicBeat * 0.5 : 0.2) * ringPulse;
        if (isMusicPlaying && currentSongTheme) {
            const hue = (elapsed * 0.1) % 1;
            ringLight.material.color.setHSL(hue, 1, 0.55);
        }
    }

    // フォグエフェクト — ゆっくり漂う
    const fogPos = fogGeo.attributes.position.array;
    for (let i = 0; i < fogParticleCount; i++) {
        fogPos[i * 3] += Math.sin(elapsed * 0.2 + i * 0.3) * 0.005;
        fogPos[i * 3 + 1] += Math.sin(elapsed * 0.15 + i * 0.5) * 0.002;
    }
    fogGeo.attributes.position.needsUpdate = true;
    fogMat.opacity = isMusicPlaying ? 0.03 + musicBeat * 0.05 : 0.02;

    // 花火エフェクト更新
    for (let i = stageFireworks.length - 1; i >= 0; i--) {
        const fw = stageFireworks[i];
        const posArr = fw.geometry.attributes.position.array;
        const vels = fw.userData.velocities;
        for (let j = 0; j < vels.length; j++) {
            posArr[j * 3] += vels[j].x;
            posArr[j * 3 + 1] += vels[j].y - 0.001; // 重力
            posArr[j * 3 + 2] += vels[j].z;
        }
        fw.geometry.attributes.position.needsUpdate = true;
        fw.userData.life -= fw.userData.decay;
        fw.material.opacity = fw.userData.life;
        if (fw.userData.life <= 0) {
            stageGroup.remove(fw);
            fw.geometry.dispose();
            fw.material.dispose();
            stageFireworks.splice(i, 1);
        }
    }

    // ビートの強い瞬間に花火発射
    if (isMusicPlaying && musicBeat > 0.7 && Math.random() > 0.92) {
        const fwColors = [0xff1493, 0x00bfff, 0xffd700, 0xff4500, 0x00ff7f, 0xff69b4];
        createFirework(
            (Math.random() - 0.5) * 20,
            6 + Math.random() * 4,
            -10 - Math.random() * 5,
            fwColors[Math.floor(Math.random() * fwColors.length)]
        );
    }

    // ==================== ★ 超輝夜姫装飾アニメーション ★ ====================
    // 灯籠のゆらぎ浮遊
    for (const l of lanterns) {
        const d = l.userData;
        l.position.x = d.baseX + Math.sin(elapsed * 0.4 + d.phase) * 0.8;
        l.position.y = d.baseY + Math.sin(elapsed * 0.25 + d.phase * 2) * 0.5;
        l.position.z = d.baseZ + Math.cos(elapsed * 0.3 + d.phase) * 0.3;
        l.rotation.y = Math.sin(elapsed * 0.2 + d.phase) * 0.15;
        l.children[1].material.opacity = 0.7 + Math.sin(elapsed * 3 + d.phase) * 0.3; // 灯りの明滅
    }

    // 桜吹雪アニメーション
    const sPos = stageSakuraGeo.attributes.position.array;
    for (let i = 0; i < stageSakuraCount; i++) {
        const v = stageSakuraVel[i];
        sPos[i * 3] += v.x + Math.sin(elapsed * 0.5 + i) * 0.003;
        sPos[i * 3 + 1] += v.y;
        sPos[i * 3 + 2] += v.z;
        // 画面外なら上に再配置
        if (sPos[i * 3 + 1] < -6) {
            sPos[i * 3] = (Math.random() - 0.5) * 40;
            sPos[i * 3 + 1] = 14 + Math.random() * 4;
            sPos[i * 3 + 2] = -20 + Math.random() * 24;
        }
    }
    stageSakuraGeo.attributes.position.needsUpdate = true;
    stageSakuraMat.opacity = 0.4 + Math.sin(elapsed * 0.7) * 0.2 + (isMusicPlaying ? musicBeat * 0.2 : 0);

    // 金粉きらめき
    const gPos = goldGeo.attributes.position.array;
    for (let i = 0; i < goldDustCount; i++) {
        gPos[i * 3] += Math.sin(elapsed * 0.3 + i * 0.5) * 0.003;
        gPos[i * 3 + 1] += Math.cos(elapsed * 0.2 + i * 0.3) * 0.002;
        gPos[i * 3 + 2] += Math.sin(elapsed * 0.15 + i * 0.7) * 0.002;
    }
    goldGeo.attributes.position.needsUpdate = true;
    goldMat.opacity = 0.4 + Math.sin(elapsed * 1.5) * 0.3 + (isMusicPlaying ? musicBeat * 0.3 : 0);

    // レーザービーム回転
    for (const laser of laserBeams) {
        const d = laser.userData;
        laser.rotation.x = Math.sin(elapsed * 0.7 + d.phase) * 0.8;
        laser.rotation.z = elapsed * 0.5 + d.phase;
        laser.material.opacity = isMusicPlaying ? musicBeat * 0.25 : 0;
    }

    // 蓮の花 浮遊回転
    for (const lotus of lotusFlowers) {
        const d = lotus.userData;
        d.orbitAngle += 0.002;
        lotus.position.x = Math.cos(d.orbitAngle) * d.orbitRadius;
        lotus.position.y = d.baseY + Math.sin(elapsed * 0.4 + d.phase) * 0.6;
        lotus.position.z = -6 + Math.sin(d.orbitAngle) * d.orbitRadius * 0.6;
        lotus.rotation.y = elapsed * 0.3 + d.phase;
    }

    // 鳥居のグロー脈動
    for (let i = 0; i < toriiArches.length; i++) {
        const a = toriiArches[i];
        const pulse = 0.4 + Math.sin(elapsed * 1.5 + i * 1.5) * 0.3 + (isMusicPlaying ? musicBeat * 0.3 : 0);
        a.children.forEach(c => {
            if (c.material) c.material.opacity = pulse * (c.material.opacity > 0 ? 1 : 0);
        });
        // PointLight
        const pl = a.children.find(c => c.isLight);
        if (pl) pl.intensity = isMusicPlaying ? musicBeat * 3 : 0.5;
    }
    // ====================  END 超輝夜姫アニメーション ====================

    // 観客席のウェーブ（追加パーティクル）
    const arenaPosArr = arenaGeo.attributes.position.array;
    for (let i = 0; i < arenaExtraCount; i++) {
        const wave = Math.sin(elapsed * 2.5 + arenaPosArr[i * 3] * 0.3) * 0.003;
        arenaPosArr[i * 3 + 1] += wave;
        if (musicBeat > 0.1) {
            arenaPosArr[i * 3 + 1] += Math.sin(elapsed * 5 + i * 0.1) * musicBeat * 0.004;
        }
    }
    arenaGeo.attributes.position.needsUpdate = true;
    arenaMat.opacity = isMusicPlaying ? 0.3 + musicBeat * 0.4 : 0.15;

    // --- 観客ペンライトアニメーション ---
    for (const pl of audiencePenlights) {
        const d = pl.userData;
        // 振りアニメーション
        pl.rotation.z = Math.sin(elapsed * d.speed + d.phase) * d.swingAmt;
        pl.position.y = d.baseY + Math.sin(elapsed * d.speed * 0.5 + d.phase) * 0.2;
        // ビート反応
        const beatOp = isMusicPlaying ? 0.5 + musicBeat * 0.5 : 0.4 + Math.sin(elapsed * 2 + d.phase) * 0.15;
        d.glowMat.opacity = beatOp;
        d.haloMat.opacity = beatOp * 0.2;
    }

    // --- 巨大ユーザー & ガラスアニメーション ---
    userPlane.material.opacity = 0.15 + Math.sin(elapsed * 0.5) * 0.05;
    userPlane.position.y = 3 + Math.sin(elapsed * 0.6) * 0.4;
    glassScreenMat.opacity = 0.02 + Math.sin(elapsed * 1.2) * 0.01 + (isMusicPlaying ? musicBeat * 0.02 : 0);
    glassFrameMat.opacity = 0.08 + (isMusicPlaying ? musicBeat * 0.08 : 0);
    userGlow.intensity = 0.3 + Math.sin(elapsed * 1.5) * 0.1 + (isMusicPlaying ? musicBeat * 0.2 : 0);
    // ステージ全体のスクロール連動
    stageGroup.position.z = -3 + scrollProgress * -5;
    stageGroup.position.y = scrollProgress * -2;

    // ===== CAMERA =====
    if (exploreMode) {
        // 探索モード: OrbitControlsに任せる
        orbitControls.update();
    } else {
        // 通常モード: マウス追従 + 曲テーマのcameraShakeで振動量が変わる
        const shakeAmount = isMusicPlaying ? (theme.cameraShake || 0.008) * musicBeat : 0;
        const shakeX = Math.sin(elapsed * 15.7) * shakeAmount;
        const shakeY = Math.cos(elapsed * 13.3) * shakeAmount;
        camera.position.x = mouse.x * 0.5 + shakeX;
        camera.position.y = mouse.y * 0.3 - scrollProgress * 0.5 + shakeY;
        camera.lookAt(shakeX * 0.3, -scrollProgress * 0.5 + shakeY * 0.3, 0);
    }

    // 動画オーバーレイ位置更新は3フレームに1回（DOM操作削減）
    if (ribbonFrame % 3 === 0) {
        updateStageVideoOverlay();
        stageVideoContainer.style.zIndex = exploreMode ? '850' : '4';
    }

    renderer.render(scene, camera);
}

animate();

// ==================== RESIZE ====================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==================== INITIAL TRIGGER ====================
revealElements();

// ==================== MEMBER CARD BONUS SYSTEM ====================
// --- Tab switching ---
document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
    });
});

// --- 3D Modal Particle Effect ---
let modal3DAnimId = null;
function startModal3D(color1, color2) {
    stopModal3D();
    const canvas = document.getElementById('modal-3d-canvas');
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    const particles = [];
    const c1 = color1, c2 = color2;
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 3 + 1,
            dx: (Math.random() - 0.5) * 1.5,
            dy: (Math.random() - 0.5) * 1.5,
            color: Math.random() > 0.5 ? c1 : c2,
            alpha: Math.random() * 0.6 + 0.2,
            pulse: Math.random() * Math.PI * 2,
        });
    }
    // Add heart particles
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: canvas.height + 20,
            r: Math.random() * 6 + 4,
            dx: (Math.random() - 0.5) * 0.8,
            dy: -(Math.random() * 1.5 + 0.5),
            color: c1,
            alpha: Math.random() * 0.5 + 0.3,
            pulse: Math.random() * Math.PI * 2,
            isHeart: true,
        });
    }
    function drawHeart(ctx, x, y, size, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        const s = size * 0.5;
        ctx.moveTo(x, y + s * 0.3);
        ctx.bezierCurveTo(x, y - s * 0.3, x - s, y - s * 0.3, x - s, y + s * 0.1);
        ctx.bezierCurveTo(x - s, y + s * 0.6, x, y + s, x, y + s * 1.2);
        ctx.bezierCurveTo(x, y + s, x + s, y + s * 0.6, x + s, y + s * 0.1);
        ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3, x, y + s * 0.3);
        ctx.fill();
        ctx.restore();
    }
    function animate3D() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const time = Date.now() * 0.001;
        particles.forEach(p => {
            p.x += p.dx;
            p.y += p.dy;
            p.pulse += 0.03;
            const a = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
            if (p.isHeart) {
                drawHeart(ctx, p.x, p.y, p.r, p.color, a);
                if (p.y < -20) { p.y = canvas.height + 20; p.x = Math.random() * canvas.width; }
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * (0.8 + 0.2 * Math.sin(p.pulse)), 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = a;
                ctx.shadowBlur = 8;
                ctx.shadowColor = p.color;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
            }
            if (p.x < -10) p.x = canvas.width + 10;
            if (p.x > canvas.width + 10) p.x = -10;
            if (p.y < -10 && !p.isHeart) p.y = canvas.height + 10;
            if (p.y > canvas.height + 10 && !p.isHeart) p.y = -10;
        });
        // Draw connecting lines between nearby particles
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = c1;
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 80) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        ctx.globalAlpha = 1;
        modal3DAnimId = requestAnimationFrame(animate3D);
    }
    animate3D();
}
function stopModal3D() {
    if (modal3DAnimId) { cancelAnimationFrame(modal3DAnimId); modal3DAnimId = null; }
    const canvas = document.getElementById('modal-3d-canvas');
    if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); }
}

// ==================== EXTENDED MEMBER DATA (Wikipedia/Official) ====================
const memberExtendedData = {
    '大谷 映美里': {
        height: '155cm', blood: 'O型', fanName: '甘やかし隊',
        role: 'ビジュアル担当 / モデル / 公認Instagram担当',
        career: 'アキシブproject元メンバー',
        centerSongs: '7thシングル「CAMEO」Wセンター(齊藤なぎさと共に)',
        solo: 'THE FIRST TAKE出演 / 「内緒バナシ」センター(2025配信)',
        trivia: [
            '愛称は「みりにゃ」',
            'ペンライトカラーは白×薄菫',
            'ファッション誌でモデルとしても活躍',
            '=LOVEのビジュアル担当として知られる',
            'S Cawaii! FASHION&BEAUTY BOOK表紙',
        ],
        history: 'デビュー当初からビジュアル面でグループを牽引。7thシングル「CAMEO」ではWセンターを務めた。2025年には「内緒バナシ」でセンターを務め、縦型MVが話題に。',
    },
    '大場 花菜': {
        height: '160cm', blood: 'A型', fanName: '花菜まる',
        role: 'ブログ担当 / イラストレーター / 準公的ブログ担当',
        career: 'YOANI1年C組元メンバー',
        centerSongs: '-',
        solo: 'Ameblo個人ブログ「はなまるきぶん」',
        trivia: [
            '愛称は「はなちゃん」',
            'ペンライトカラーはオレンジ×青',
            'イラストが得意で、グッズデザインにも関わる',
            '個人ブログ「はなまるきぶん」で日常を発信',
            'MUSIC VERSE出演メンバーの一人',
        ],
        history: '代々木アニメーション学院出身。ブログやイラストでファンとの交流を大切にしている。MUSIC VERSEなどTV出演も増加中。',
    },
    '音嶋 莉沙': {
        height: '160cm', blood: 'B型', fanName: '-',
        role: '姫キャラ / モデル / 公認Instagram担当',
        career: 'iDOL Street 8期ストリート生元メンバー / 元HKT48 4期生(合格取消)',
        centerSongs: '-',
        solo: '-',
        trivia: [
            '愛称は「りさちゃん」',
            'ペンライトカラーは水色×濃ピンク',
            '福岡県出身で九州弁が可愛いと評判',
            'HKT48の4期生オーディションに合格した経験あり',
            'Instagram公認担当としてグループの発信に貢献',
        ],
        history: 'アイドル経験豊富で、iDOL StreetやHKT48を経て=LOVEに加入。姫キャラとして独自のポジションを確立。',
    },
    '齋藤 樹愛羅': {
        height: '156.2cm', blood: 'B型', fanName: 'きあら部',
        role: 'バラエティ担当 / 15thシングルセンター',
        career: 'アモレカリーナ東京元メンバー',
        centerSongs: '15thシングル「ラストノートしか知らない」',
        solo: 'MUSIC VERSE出演 / 絶叫学級ボイスドラマ出演',
        trivia: [
            '愛称は「きあら」',
            'ペンライトカラーは薄ピンク',
            '栃木県出身',
            '15thシングルで初センターに抜擢',
            'バラエティ番組での天然キャラが人気',
            'MUSIC VERSEレギュラー出演メンバー',
        ],
        history: 'アモレカリーナ東京から=LOVEへ。最年少ながらバラエティで才能を発揮。15thシングル「ラストノートしか知らない」でセンターを射止めた。',
    },
    '佐々木 舞香': {
        height: '157cm', blood: 'A型', fanName: 'もちごころ',
        role: '歌唱力エース / 演技派 / メインセンター',
        career: '穂の国娘。元メンバー',
        centerSongs: '11th以降の主要センター(11th, 13th, 14th(W), 17th, 18th, 19thなど)',
        solo: 'THE FIRST TAKE出演(あの子コンプレックス) / 絶叫学級ボイスドラマ出演',
        trivia: [
            '愛称は「まいか」',
            'ペンライトカラーは白',
            '愛知県出身',
            '11thシングル以降、グループの新センターとして活躍',
            'THE FIRST TAKEではその歌唱力が絶賛された',
            '14thシングルでは野口衣織とWセンター',
        ],
        history: '穂の国娘。から=LOVEへ。11thシングルから髙松瞳に代わりセンターを担当し、歌唱力と表現力でグループを新時代へ導いている。THE FIRST TAKE出演でも高い評価を得た。',
    },
    '高松 瞳': {
        height: '163cm', blood: 'AB型', fanName: 'eye\'s(#eyes)',
        role: '絶対的エースセンター / グループの顔',
        career: '-',
        centerSongs: '1st-5th, 8th-10thシングル, 1stアルバムリード曲',
        solo: 'ロート製薬ロートリセCMコラボ',
        trivia: [
            '愛称は「ひとみん」「ひときち」',
            'ペンライトカラーは赤',
            '東京都出身、メンバー最長身の163cm',
            'デビューから5thまで連続センターを務めた絶対的エース',
            '11thシングルで自らセンターを辞退した',
            'ロートリセのコラボで「ときめくアイドルアイムービー」出演',
        ],
        history: 'デビューからグループの絶対的センターとして活躍。1st-5th, 8th-10thシングルでセンターを務める。11thシングルでは後輩のためにセンターを辞退する決断をした。代々木第一体育館やKアリーナ横浜のステージに立つ。',
    },
    '瀧脇 笙古': {
        height: '158cm', blood: 'O型', fanName: 'しょこら',
        role: 'スポーツ/料理担当 / 元気印',
        career: '-',
        centerSongs: '-',
        solo: 'クックアイドルNo.1決定戦優勝(TIF2018)',
        trivia: [
            '愛称は「しょこ」',
            'ペンライトカラーは黄×オレンジ×濃ピンク(3色)',
            '神奈川県出身',
            'TIF2018のクックアイドルNo.1決定戦で優勝した料理上手',
            '3色ペンライトはメンバー中最多',
            '元気いっぱいのパフォーマンスが持ち味',
        ],
        history: 'TIF2018ではクックアイドルNo.1決定戦で優勝し、料理の腕前を証明。3色ペンライトという珍しいカラーを持ち、ライブでは独特の光景を作り出す。',
    },
    '野口 衣織': {
        height: '161cm', blood: 'O型', fanName: 'いおりんぐ',
        role: 'オタク/2次元担当 / 表現力モンスター',
        career: '-',
        centerSongs: '12th「Be Selfish」, 14th「ナツマトペ」(W), 16th「呪って呪って」',
        solo: 'THE FIRST TAKE出演 / 絶叫学級ボイスドラマ / 常陽銀行イメキャラ',
        trivia: [
            '愛称は「いおりん」',
            'ペンライトカラーは紫',
            '茨城県出身',
            '12th, 14th(W), 16thシングルでセンターを務める',
            'THE FIRST TAKEでは圧倒的な表現力を披露',
            '常陽銀行のイメージキャラクターに就任',
            'オタク気質で2次元への愛が深い',
        ],
        history: '=LOVEの表現力モンスター。12thシングル「Be Selfish」で初センターを獲得後、14th, 16thでもセンターを務める。THE FIRST TAKEでは佐々木舞香・諸橋沙夏と共に「あの子コンプレックス」を一発撮りで披露し、高い評価を獲得。',
    },
    '諸橋 沙夏': {
        height: '158cm', blood: 'B型', fanName: 'つん族',
        role: '歌唱力エース / 最年長 / ソロコンサート経験者',
        career: 'Baby Tiara元メンバー',
        centerSongs: '-',
        solo: 'ソロコンサート開催(2023) / ソロ曲「宝物はグリーン」/ THE FIRST TAKE出演',
        trivia: [
            '愛称は「さなつん」',
            'ペンライトカラーは緑',
            '福島県出身、グループ最年長',
            '2023年にメンバー初のソロコンサートを開催',
            'ソロ曲「宝物はグリーン」が配信リリース',
            'THE FIRST TAKEではその歌唱力が注目された',
            'Baby Tiara出身の実力派',
        ],
        history: 'Baby Tiara出身でアイドル歴が長い実力派。グループ最年長としてメンバーを支える存在。2023年にはメンバー初となるソロコンサートを品川プリンスホテル ステラボールで開催し、ソロ曲「宝物はグリーン」もリリース。',
    },
    '山本 杏奈': {
        height: '149.5cm', blood: 'A型', fanName: '杏zoo',
        role: 'リーダー(2017年12月9日-)',
        career: 'SPL∞ASH元メンバー',
        centerSongs: '-',
        solo: 'ソロ曲「おかえり、花便り」/ まいにちアイドル2000日達成',
        trivia: [
            '愛称は「あんにゃ」',
            'ペンライトカラーは黄×青',
            '広島県出身、メンバー最小の149.5cm',
            '2017年12月9日からリーダーに就任',
            'まいにちアイドル2000日&累計3億ポイントチャレンジ達成',
            'ソロ曲「おかえり、花便り」の振付も自ら担当',
            'SPL∞ASHでのアイドル経験を活かしリーダーシップを発揮',
        ],
        history: 'SPL∞ASH元メンバーとしてのアイドル経験を持つ。2017年12月からリーダーに就任し、グループを最前線で引っ張る。まいにちアイドル2000日という偉業を達成し、記念ソロ曲「おかえり、花便り」がリリースされた。国立競技場でのSTADIUM LIVEへ向けてグループを導く。',
    },
};

// Collectible system
let collectedCards = JSON.parse(localStorage.getItem('ilove_collected') || '[]');

function showMemberBonus(memberName, color1, color2) {
    const ext = memberExtendedData[memberName];
    if (!ext) return;
    const triviaArr = ext.trivia || [];
    const quote = triviaArr[Math.floor(Math.random() * triviaArr.length)] || ext.role;
    const fact = ext.solo || ext.centerSongs || '-';

    // Track collection
    if (!collectedCards.includes(memberName)) {
        collectedCards.push(memberName);
        localStorage.setItem('ilove_collected', JSON.stringify(collectedCards));
    }

    // Create bonus popup
    const popup = document.createElement('div');
    popup.className = 'member-bonus-popup';
    popup.innerHTML = `
        <div class="bonus-popup-inner" style="--bonus-color: ${color1}">
            <div class="bonus-header">
                <span class="bonus-star">★</span>
                <span>MEMBER BONUS!</span>
            </div>
            <div class="bonus-quote">${quote}</div>
            <div class="bonus-fact">${fact}</div>
            <div class="bonus-collect">
                <span class="bonus-collect-label">COLLECTION</span>
                <span class="bonus-collect-count">${collectedCards.length}/10</span>
            </div>
            ${collectedCards.length === 10 ? '<div class="bonus-complete">全メンバーコンプリート！</div>' : ''}
        </div>
    `;
    document.body.appendChild(popup);

    // Confetti burst on member color
    createMemberConfetti(color1, color2);

    setTimeout(() => popup.classList.add('active'), 10);
    setTimeout(() => {
        popup.classList.remove('active');
        setTimeout(() => popup.remove(), 500);
    }, 3500);
}

function createMemberConfetti(color1, color2) {
    for (let i = 0; i < 30; i++) {
        const conf = document.createElement('div');
        conf.className = 'member-confetti';
        const x = 40 + Math.random() * 20;
        const y = 30 + Math.random() * 20;
        conf.style.cssText = `
            left: ${x}%; top: ${y}%;
            background: ${Math.random() > 0.5 ? color1 : color2};
            --conf-x: ${(Math.random() - 0.5) * 300}px;
            --conf-y: ${-100 - Math.random() * 200}px;
            --conf-r: ${Math.random() * 720}deg;
            animation-delay: ${Math.random() * 0.3}s;
        `;
        document.body.appendChild(conf);
        setTimeout(() => conf.remove(), 1500);
    }
}

