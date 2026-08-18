import { LANE_X, CONFIG } from './GameConfig';
import { PlayerController } from './PlayerController';

/** Що саме летить на гравця. Тип задає і поведінку, і спосіб ухилитись. */
export enum ItemKind {
    /** Стіна на всю висоту — рятує лише зміна смуги. */
    Barrier = 'Barrier',
    /** Низька перешкода — перестрибнути. */
    JumpOver = 'JumpOver',
    /** Підвішена перешкода — підкотитись під нею. */
    SlideUnder = 'SlideUnder',
    /** Монетка — дає бали. */
    Coin = 'Coin',
}

/**
 * TrackItem.ts
 * ---------------------------------------------------------------
 * Один обʼєкт на доріжці: перешкода або монетка.
 *
 * Це звичайний клас, а не компонент. Так зроблено навмисно: якби
 * кожна перешкода була ScriptComponent, то в редакторі довелося б
 * руками зв'язувати десяток обʼєктів пулу з менеджером. Тут пул
 * створюється кодом з одного шаблону, а сцена лишається чистою.
 *
 * Про зіткнення: перевірка робиться в коді (смуга + відстань по Z),
 * а не фізичними колайдерами. На максимальній швидкості обʼєкт
 * проходить ~20 см за кадр, тож тонкий колайдер можна просто
 * "перестрибнути" між кадрами (tunneling). Перевірка по смузі
 * детермінована, не залежить від FPS і легко дебажиться.
 * ---------------------------------------------------------------
 */
export class TrackItem {
    readonly kind: ItemKind;

    private readonly sceneObject: SceneObject;
    private readonly transform: Transform;
    /** Висота, на якій обʼєкт лежить у шаблоні — визначає, підвісний він чи ні. */
    private readonly baseY: number;

    private active: boolean = false;
    private lane: number = 1;
    private z: number = 0;
    /** Монетку можна забрати лише раз, навіть якщо вона ще не доїхала до despawn. */
    private consumed: boolean = false;

    constructor(sceneObject: SceneObject, kind: ItemKind) {
        this.sceneObject = sceneObject;
        this.kind = kind;
        this.transform = sceneObject.getTransform();
        this.baseY = this.transform.getLocalPosition().y;
        this.deactivate();
    }

    isActive(): boolean {
        return this.active;
    }

    getLane(): number {
        return this.lane;
    }

    /** Ставить обʼєкт на початок доріжки у вказану смугу. */
    activate(lane: number) {
        this.active = true;
        this.consumed = false;
        this.lane = lane;
        this.z = CONFIG.spawnZ;
        this.sceneObject.enabled = true;
        this.applyPosition();
    }

    deactivate() {
        this.active = false;
        this.sceneObject.enabled = false;
    }

    /**
     * Рухає обʼєкт до гравця. Повертає false, якщо обʼєкт проїхав повз
     * і повернувся в пул — тоді спавнер може віддати його наступним.
     */
    advance(dt: number, speed: number): boolean {
        if (!this.active) {
            return false;
        }

        // -Z це "вперед", тож обʼєкти їдуть до камери у бік +Z.
        this.z += speed * dt;
        if (this.z > CONFIG.despawnZ) {
            this.deactivate();
            return false;
        }

        this.applyPosition();
        return true;
    }

    /**
     * Чи зіткнувся цей обʼєкт з гравцем саме зараз.
     * Для монетки означає "підібрано".
     */
    overlapsPlayer(player: PlayerController): boolean {
        if (!this.active || this.consumed) {
            return false;
        }
        if (player.getLane() !== this.lane) {
            return false;
        }

        const halfDepth = this.kind === ItemKind.Coin ? CONFIG.coinHalfDepth : CONFIG.hitHalfDepth;
        if (Math.abs(this.z - CONFIG.playerZ) > halfDepth) {
            return false;
        }

        return this.isNotAvoided(player);
    }

    /** Позначає обʼєкт як відпрацьований, щоб він не спрацював двічі. */
    consume() {
        this.consumed = true;
        if (this.kind === ItemKind.Coin) {
            // Монетка зникає одразу — це очікуваний фідбек на підбір.
            this.deactivate();
        }
    }

    // ---------------------------------------------------------------

    /** Чи НЕ вдалося гравцю ухилитись — тобто чи це справді влучання. */
    private isNotAvoided(player: PlayerController): boolean {
        switch (this.kind) {
            case ItemKind.JumpOver:
                return player.getHeight() < CONFIG.jumpClearHeight;
            case ItemKind.SlideUnder:
                return !player.isSlidingNow();
            case ItemKind.Coin:
            case ItemKind.Barrier:
            default:
                // Монетку забираємо завжди, стіну не оминути нічим, окрім смуги.
                return true;
        }
    }

    private applyPosition() {
        this.transform.setLocalPosition(new vec3(LANE_X[this.lane], this.baseY, this.z));
    }
}
