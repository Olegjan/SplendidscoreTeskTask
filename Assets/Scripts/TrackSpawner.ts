import { CONFIG, LANE_COUNT } from './GameConfig';
import { ItemKind, TrackItem } from './TrackItem';
import { PlayerController } from './PlayerController';

/**
 * TrackSpawner.ts
 * ---------------------------------------------------------------
 * Відповідає за все, що їде на гравця: створює пул обʼєктів,
 * випускає їх за розкладом, рухає і повідомляє про зіткнення.
 *
 * Пул замість create/destroy: створення SceneObject під час гри дає
 * помітний фрейм-дроп на мобільному рантаймі. Тут усі обʼєкти
 * клонуються один раз на старті з шаблонів у сцені, а далі лише
 * вмикаються й вимикаються.
 *
 * Шаблони в сцені мають бути вимкнені — вони лише "форма для
 * відливки", у грі показуються тільки їхні копії.
 * ---------------------------------------------------------------
 */
@component
export class TrackSpawner extends BaseScriptComponent {
    @input
    @hint('Порожній обʼєкт, під яким складаються всі клони пулу.')
    poolRoot: SceneObject;

    @input
    @hint('Гравець — потрібен, щоб перевіряти зіткнення.')
    player: PlayerController;

    @input
    @hint('Стіна на всю висоту: оминається лише зміною смуги.')
    barrierTemplate: SceneObject;

    @input
    @hint('Низька перешкода: перестрибнути.')
    jumpTemplate: SceneObject;

    @input
    @hint('Підвішена перешкода: підкотитись під нею.')
    slideTemplate: SceneObject;

    @input
    @hint('Монетка: дає бали.')
    coinTemplate: SceneObject;

    private obstacles: TrackItem[] = [];
    private coins: TrackItem[] = [];

    private running: boolean = false;
    private speed: number = CONFIG.baseSpeed;
    private spawnInterval: number = CONFIG.spawnIntervalStart;

    private obstacleTimer: number = 0;
    private coinTimer: number = 0;
    private lastObstacleLane: number = -1;

    private onHitHandler: (() => void) | null = null;
    private onCoinHandler: (() => void) | null = null;

    onAwake() {
        this.buildPools();
        this.createEvent('UpdateEvent').bind(() => this.onUpdate());
    }

    // ---------------------------------------------------------------
    // Публічний інтерфейс для GameManager
    // ---------------------------------------------------------------

    onObstacleHit(handler: () => void) {
        this.onHitHandler = handler;
    }

    onCoinCollected(handler: () => void) {
        this.onCoinHandler = handler;
    }

    setRunning(running: boolean) {
        this.running = running;
    }

    setSpeed(speed: number) {
        this.speed = speed;
    }

    setSpawnInterval(interval: number) {
        this.spawnInterval = interval;
    }

    /** Прибирає доріжку — викликається перед новою спробою. */
    reset() {
        for (const item of this.obstacles) {
            item.deactivate();
        }
        for (const item of this.coins) {
            item.deactivate();
        }
        this.speed = CONFIG.baseSpeed;
        this.spawnInterval = CONFIG.spawnIntervalStart;
        // Перша перешкода не має падати гравцю на голову одразу після старту.
        this.obstacleTimer = -CONFIG.spawnIntervalStart;
        this.coinTimer = 0;
        this.lastObstacleLane = -1;
    }

    // ---------------------------------------------------------------

    private buildPools() {
        const templates: { template: SceneObject; kind: ItemKind }[] = [
            { template: this.barrierTemplate, kind: ItemKind.Barrier },
            { template: this.jumpTemplate, kind: ItemKind.JumpOver },
            { template: this.slideTemplate, kind: ItemKind.SlideUnder },
        ];

        // Пул перешкод набирається по колу, щоб усі три типи були
        // представлені рівномірно, а не як пощастить з рандомом.
        for (let i = 0; i < CONFIG.obstaclePoolSize; i++) {
            const source = templates[i % templates.length];
            this.obstacles.push(this.instantiate(source.template, source.kind));
        }

        for (let i = 0; i < CONFIG.coinPoolSize; i++) {
            this.coins.push(this.instantiate(this.coinTemplate, ItemKind.Coin));
        }
    }

    private instantiate(template: SceneObject, kind: ItemKind): TrackItem {
        const copy = this.poolRoot.copyWholeHierarchy(template);
        copy.name = kind + '_' + this.obstacles.length + '_' + this.coins.length;
        return new TrackItem(copy, kind);
    }

    private onUpdate() {
        if (!this.running) {
            return;
        }

        const dt = getDeltaTime();
        this.advanceAll(dt);
        this.spawnOnSchedule(dt);
        this.checkCollisions();
    }

    private advanceAll(dt: number) {
        for (const item of this.obstacles) {
            item.advance(dt, this.speed);
        }
        for (const item of this.coins) {
            item.advance(dt, this.speed);
        }
    }

    private spawnOnSchedule(dt: number) {
        this.obstacleTimer += dt;
        if (this.obstacleTimer >= this.spawnInterval) {
            this.obstacleTimer = 0;
            this.spawnObstacle();
        }

        this.coinTimer += dt;
        if (this.coinTimer >= CONFIG.coinInterval) {
            this.coinTimer = 0;
            this.spawnCoin();
        }
    }

    private spawnObstacle() {
        const free = this.obstacles.find((item) => !item.isActive());
        if (!free) {
            return; // пул вичерпано — пропускаємо такт, це краще за фрейм-дроп
        }

        // Дві перешкоди поспіль в одній смузі змушують гравця стояти на місці,
        // а перескок через дві смуги за раз неможливий — тому зсуваємось на одну.
        let lane = Math.floor(Math.random() * LANE_COUNT);
        if (lane === this.lastObstacleLane) {
            lane = (lane + 1) % LANE_COUNT;
        }
        this.lastObstacleLane = lane;

        free.activate(lane);
    }

    private spawnCoin() {
        const free = this.coins.find((item) => !item.isActive());
        if (!free) {
            return;
        }

        // Монетка не має висіти в тій самій смузі, куди щойно пішла перешкода —
        // інакше гра карає гравця за те, що вона сама ж і заохочує.
        let lane = Math.floor(Math.random() * LANE_COUNT);
        if (lane === this.lastObstacleLane) {
            lane = (lane + 1) % LANE_COUNT;
        }

        free.activate(lane);
    }

    private checkCollisions() {
        for (const item of this.obstacles) {
            if (item.overlapsPlayer(this.player)) {
                item.consume();
                if (this.onHitHandler) {
                    this.onHitHandler();
                }
            }
        }

        for (const item of this.coins) {
            if (item.overlapsPlayer(this.player)) {
                item.consume();
                if (this.onCoinHandler) {
                    this.onCoinHandler();
                }
            }
        }
    }
}
