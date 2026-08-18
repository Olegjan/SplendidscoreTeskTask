import { CONFIG } from './GameConfig';
import { PlayerController } from './PlayerController';
import { TrackSpawner } from './TrackSpawner';
import { UIManager } from './UIManager';
import { ScoreManager } from './ScoreManager';
import { Swipe, SwipeInput } from './SwipeInput';
import { AudioManager, Sfx } from './AudioManager';

/**
 * GameManager.ts
 * ---------------------------------------------------------------
 * Стан гри і тільки він: Menu → Playing → GameOver → Playing.
 *
 * Це єдиний скрипт, який знає про решту. Гравець, спавнер і UI одне
 * про одного не знають — усі звʼязки сходяться сюди. Такий "хаб"
 * тримає граф залежностей деревом, а не павутинням, і дозволяє
 * замінити будь-який шматок, не чіпаючи інші.
 *
 * Тут же живе ввід: рішення "цей свайп зараз щось означає?" залежить
 * від стану гри, а не від персонажа.
 *
 * Розмістити на окремому обʼєкті "GameManager" вгорі ієрархії —
 * Lens Studio виконує скрипти згори вниз, і менеджер має
 * проініціалізуватись раніше за тих, ким керує.
 * ---------------------------------------------------------------
 */

enum GameState {
    Menu = 'Menu',
    Playing = 'Playing',
    GameOver = 'GameOver',
}

@component
export class GameManager extends BaseScriptComponent {
    @input
    player: PlayerController;

    @input
    spawner: TrackSpawner;

    @input
    ui: UIManager;

    @input
    @allowUndefined
    @hint('Звуки подій. Необовʼязковий — без нього гра працює мовчки.')
    audio: AudioManager;

    private readonly scoreManager: ScoreManager = new ScoreManager();
    private input: SwipeInput;

    private state: GameState = GameState.Menu;
    private lives: number = CONFIG.maxLives;
    private elapsedTime: number = 0;
    private lastHitTime: number = -999;
    /** Скільки ще триває прискорення за вдалий стрибок, с. */
    private boostTimer: number = 0;

    onAwake() {
        // Тут можна чіпати лише себе. Цей компонент висить на батьківському
        // обʼєкті, а Lens Studio будить скрипти згори вниз по ієрархії — тож
        // на момент нашого onAwake дочірні PlayerController/TrackSpawner/UIManager
        // ще не існують як TS-обʼєкти, і будь-який виклик їхнього методу
        // впаде з "undefined is not a function".
        this.input = new SwipeInput(this);
        this.input.onSwipe((direction) => this.onSwipe(direction));
        this.input.onTap(() => this.onTap());

        this.createEvent('OnStartEvent').bind(() => this.onStart());
        this.createEvent('UpdateEvent').bind(() => this.onUpdate());
    }

    /** OnStart гарантує, що всі onAwake у сцені вже відпрацювали. */
    private onStart() {
        this.spawner.onObstacleHit(() => this.onObstacleHit());
        this.spawner.onCoinCollected(() => this.onCoinCollected());
        this.spawner.onJumpCleared(() => this.onJumpCleared());
        this.enterMenu();
    }

    // ---------------------------------------------------------------
    // Ввід
    // ---------------------------------------------------------------

    private onSwipe(direction: Swipe) {
        if (this.state !== GameState.Playing) {
            // Поза грою свайп теж вважаємо за "хочу грати" — інакше гравець,
            // який змахнув на екрані Game Over, не зрозуміє, чому нічого не сталось.
            this.startGame();
            return;
        }

        switch (direction) {
            // Кожна команда повідомляє, чи дія справді відбулася: скраю смуга
            // не міняється, а стрибок під час підкату ігнорується. Озвучуємо
            // лише успішні — інакше свайп «клацав» би без руху на екрані.
            case Swipe.Left:
                if (this.player.moveLeft()) {
                    this.playSfx(Sfx.Lane);
                }
                break;
            case Swipe.Right:
                if (this.player.moveRight()) {
                    this.playSfx(Sfx.Lane);
                }
                break;
            case Swipe.Up:
                if (this.player.jump()) {
                    this.playSfx(Sfx.Jump);
                }
                break;
            case Swipe.Down:
                if (this.player.slide()) {
                    this.playSfx(Sfx.Slide);
                }
                break;
        }
    }

    /** Звук необовʼязковий, тож перевірку тримаємо в одному місці. */
    private playSfx(event: Sfx) {
        if (this.audio) {
            this.audio.play(event);
        }
    }

    private onTap() {
        // Тап — це старт і рестарт. Окрема кнопка тут нічого не додала б:
        // на екранах меню та Game Over інших дій просто немає.
        if (this.state !== GameState.Playing) {
            this.startGame();
        }
    }

    // ---------------------------------------------------------------
    // Стани
    // ---------------------------------------------------------------

    private enterMenu() {
        this.state = GameState.Menu;
        this.spawner.setRunning(false);
        this.spawner.reset();
        this.player.reset();
        this.ui.showMenu();
    }

    /** Старт і рестарт — це одне й те саме: гра завжди починається з чистого стану. */
    private startGame() {
        this.state = GameState.Playing;
        this.lives = CONFIG.maxLives;
        this.elapsedTime = 0;
        this.lastHitTime = -999;
        this.boostTimer = 0;

        this.scoreManager.reset();
        this.player.reset();
        this.player.enterRun();
        this.spawner.reset();
        this.spawner.setRunning(true);

        this.ui.showHud();
        this.ui.updateScore(0);
        this.ui.updateLives(this.lives, CONFIG.maxLives);
    }

    private endGame() {
        this.state = GameState.GameOver;
        this.spawner.setRunning(false);
        // Третє зіткнення — біг зупиняється, персонаж переходить у стійку.
        this.player.enterIdle();
        this.ui.showGameOver(this.scoreManager.getScore(), this.scoreManager.getBest());
    }

    // ---------------------------------------------------------------
    // Ігровий цикл
    // ---------------------------------------------------------------

    private onUpdate() {
        if (this.state !== GameState.Playing) {
            return;
        }

        const dt = getDeltaTime();
        this.elapsedTime += dt;

        // Складність росте лінійно і впирається в стелю з GameConfig.
        // Ростуть обидва параметри: швидкість (менше часу на реакцію)
        // і щільність перешкод (менше пауз між рішеннями).
        const speed = Math.min(
            CONFIG.maxSpeed,
            CONFIG.baseSpeed + this.elapsedTime * CONFIG.speedRampPerSecond
        );
        const interval = Math.max(
            CONFIG.spawnIntervalMin,
            CONFIG.spawnIntervalStart - this.elapsedTime * CONFIG.spawnIntervalRampPerSecond
        );

        this.spawner.setSpeed(speed * this.consumeBoost(dt));
        this.spawner.setSpawnInterval(interval);

        this.scoreManager.addTime(dt);
        this.ui.updateScore(this.scoreManager.getScore());
    }

    private onObstacleHit() {
        if (this.state !== GameState.Playing) {
            return;
        }

        // Вікно недоторканності: широка перешкода може перекривати гравця
        // кілька кадрів поспіль, і без цього три життя зникали б за мить.
        if (this.elapsedTime - this.lastHitTime < CONFIG.hitInvulnerability) {
            return;
        }
        this.lastHitTime = this.elapsedTime;

        this.lives -= 1;
        this.ui.updateLives(this.lives, CONFIG.maxLives);
        this.playSfx(Sfx.Hit);

        if (this.lives <= 0) {
            // Останнє зіткнення — без мигання: далі йде поза очікування,
            // і блимання поверх неї читалося б як збій, а не як фідбек.
            this.endGame();
        } else {
            this.player.startHitFlash();
        }
    }

    /**
     * Вдалий стрибок нагороджується ривком швидкості.
     *
     * Прискорення множиться на базову швидкість, а не додається до неї:
     * так ривок відчувається однаково і на початку гри, і коли світ уже
     * розігнався. Стеля `maxSpeed` на нього навмисно не поширюється —
     * це коротка нагорода, а не новий рівень складності.
     */
    private onJumpCleared() {
        if (this.state !== GameState.Playing) {
            return;
        }
        this.boostTimer = CONFIG.jumpBoostDuration;
    }

    /** Повертає поточний множник швидкості й підточує таймер прискорення. */
    private consumeBoost(deltaTime: number): number {
        if (this.boostTimer <= 0) {
            return 1;
        }

        // Множник спадає лінійно від максимуму до 1 — ривок на вході,
        // плавне повернення до звичайного темпу на виході.
        const strength = this.boostTimer / CONFIG.jumpBoostDuration;
        this.boostTimer = Math.max(0, this.boostTimer - deltaTime);
        return 1 + (CONFIG.jumpBoostMultiplier - 1) * strength;
    }

    private onCoinCollected() {
        if (this.state !== GameState.Playing) {
            return;
        }
        this.scoreManager.addCoin();
        this.ui.updateScore(this.scoreManager.getScore());
        this.playSfx(Sfx.Coin);
    }
}
