import { LANE_X, CONFIG, clampLane } from './GameConfig';

/**
 * PlayerController.ts
 * ---------------------------------------------------------------
 * Рух персонажа: три смуги, стрибок, підкат.
 *
 * Свідомо НЕ читає ввід сам — приймає команди (moveLeft/jump/…)
 * від GameManager. Причина: рішення "чи взагалі зараз можна
 * керувати" належить стану гри, а не персонажу. Інакше довелося б
 * тягнути посилання на GameManager сюди й отримати цикл залежностей.
 *
 * Вішається на кореневий обʼєкт "Player". Сам компонент рухає
 * трансформ свого SceneObject (X — смуга, Y — стрибок), а візуал
 * (Bitmoji) стискає окремо — щоб присідання не ламало математику смуг.
 * ---------------------------------------------------------------
 */
@component
export class PlayerController extends BaseScriptComponent {
    @input
    @hint('Обʼєкт Bitmoji-персонажа (нащадок цього обʼєкта). Його стискаємо під час підкату.')
    playerVisual: SceneObject;

    @input
    @allowUndefined
    @hint('Animation Player на обʼєкті Bitmoji. Без нього гра працює, просто без анімації.')
    animationPlayer: AnimationPlayer;

    @input
    @allowUndefined
    @hint('Mixamo "Fast Run" — базовий біг.')
    runAnimation: AnimationAsset;

    @input
    @allowUndefined
    @hint('Mixamo "Left Strafe" — нахил вліво при зміні смуги.')
    leftAnimation: AnimationAsset;

    @input
    @allowUndefined
    @hint('Mixamo "Right Strafe" — нахил вправо при зміні смуги.')
    rightAnimation: AnimationAsset;

    /** Імена кліпів усередині Animation Player. Створюються кодом в onAwake. */
    private static readonly CLIP_RUN = 'Run';
    private static readonly CLIP_LEFT = 'Left';
    private static readonly CLIP_RIGHT = 'Right';

    private currentLane: number = 1;
    private baseY: number = 0;
    private baseScale: vec3 = vec3.one();

    private isJumping: boolean = false;
    private isSliding: boolean = false;
    private jumpTimer: number = 0;
    private slideTimer: number = 0;

    /** Згладжений напрямок [-1..1] для блендингу анімації strafe. */
    private animDirection: number = 0;
    private targetDirection: number = 0;

    onAwake() {
        const transform = this.getSceneObject().getTransform();
        this.baseY = transform.getLocalPosition().y;
        this.baseScale = this.playerVisual.getTransform().getLocalScale();

        this.setupAnimation();
        this.createEvent('UpdateEvent').bind(() => this.onUpdate());
    }

    /**
     * Збирає три кліпи в Animation Player і запускає їх усі одночасно.
     *
     * Це ручний аналог blend tree: замість того, щоб конфігурувати
     * Animation State Manager десятком полів у редакторі, ми тримаємо
     * всі три кліпи програними в циклі й міняємо лише їхні ваги.
     * Порядок додавання важливий — Run кладеться першим як база, а
     * strafe-кліпи домішуються поверх нього.
     */
    private setupAnimation() {
        if (!this.animationPlayer) {
            return;
        }

        this.addClip(PlayerController.CLIP_RUN, this.runAnimation);
        this.addClip(PlayerController.CLIP_LEFT, this.leftAnimation);
        this.addClip(PlayerController.CLIP_RIGHT, this.rightAnimation);

        this.animationPlayer.playAll();
        this.applyClipWeights(0);
    }

    private addClip(name: string, animation: AnimationAsset) {
        if (!animation) {
            return;
        }
        const clip = AnimationClip.createFromAnimation(name, animation);
        clip.playbackMode = PlaybackMode.Loop;
        clip.weight = 0;
        this.animationPlayer.addClip(clip);
    }

    // ---------------------------------------------------------------
    // Команди ззовні
    // ---------------------------------------------------------------

    moveLeft() {
        this.changeLane(-1);
    }

    moveRight() {
        this.changeLane(1);
    }

    jump() {
        // Одна дія за раз: стрибок під час підкату виглядав би як баг.
        if (this.isJumping || this.isSliding) {
            return;
        }
        this.isJumping = true;
        this.jumpTimer = 0;
    }

    slide() {
        if (this.isJumping || this.isSliding) {
            return;
        }
        this.isSliding = true;
        this.slideTimer = 0;
        this.applySlideScale(true);
    }

    /** Повертає гравця в стартовий стан — використовується при рестарті. */
    reset() {
        this.currentLane = 1;
        this.isJumping = false;
        this.isSliding = false;
        this.jumpTimer = 0;
        this.slideTimer = 0;
        this.animDirection = 0;
        this.targetDirection = 0;

        this.applySlideScale(false);
        this.getSceneObject()
            .getTransform()
            .setLocalPosition(new vec3(LANE_X[this.currentLane], this.baseY, CONFIG.playerZ));
    }

    // ---------------------------------------------------------------
    // Стан для перевірки зіткнень
    // ---------------------------------------------------------------

    getLane(): number {
        return this.currentLane;
    }

    /** Висота над землею — за нею вирішується, чи перестрибнув гравець перешкоду. */
    getHeight(): number {
        return this.getSceneObject().getTransform().getLocalPosition().y - this.baseY;
    }

    isSlidingNow(): boolean {
        return this.isSliding;
    }

    // ---------------------------------------------------------------
    // Внутрішнє
    // ---------------------------------------------------------------

    private changeLane(delta: number) {
        const target = clampLane(this.currentLane + delta);
        if (target === this.currentLane) {
            return; // вже скраю — жест ігноруємо
        }
        this.currentLane = target;
        this.targetDirection = delta > 0 ? 1 : -1;
    }

    private applySlideScale(sliding: boolean) {
        const scale = sliding
            ? new vec3(this.baseScale.x, this.baseScale.y * CONFIG.slideScaleY, this.baseScale.z)
            : this.baseScale;
        this.playerVisual.getTransform().setLocalScale(scale);
    }

    private onUpdate() {
        const dt = getDeltaTime();
        const transform = this.getSceneObject().getTransform();
        const position = transform.getLocalPosition();

        // --- Смуга: плавний, але швидкий доїзд до цільового X ---
        // Крок lerp прив'язаний до dt, щоб керування не залежало від FPS.
        const laneStep = Math.min(1, dt / CONFIG.laneChangeDuration);
        const x = MathUtils.lerp(position.x, LANE_X[this.currentLane], laneStep);

        // --- Стрибок: синусоїдна дуга, нуль на початку й у кінці ---
        let y = this.baseY;
        if (this.isJumping) {
            this.jumpTimer += dt;
            const progress = this.jumpTimer / CONFIG.jumpDuration;
            if (progress >= 1) {
                this.isJumping = false;
            } else {
                y = this.baseY + Math.sin(progress * Math.PI) * CONFIG.jumpHeight;
            }
        }

        // --- Підкат: тримаємо стиснений масштаб, поки не вийде час ---
        if (this.isSliding) {
            this.slideTimer += dt;
            if (this.slideTimer >= CONFIG.slideDuration) {
                this.isSliding = false;
                this.applySlideScale(false);
            }
        }

        transform.setLocalPosition(new vec3(x, y, position.z));

        this.updateStrafeAnimation(dt, x);
    }

    /** Змішує біг зі strafe-анімацією залежно від того, куди їде персонаж. */
    private updateStrafeAnimation(dt: number, currentX: number) {
        // Доїхали до смуги — повертаємо корпус прямо.
        if (Math.abs(currentX - LANE_X[this.currentLane]) < 0.5) {
            this.targetDirection = 0;
        }

        // Згладжуємо: різкий стрибок ваги виглядав би як смикання моделі.
        this.animDirection = MathUtils.lerp(this.animDirection, this.targetDirection, Math.min(1, dt * 8));
        this.applyClipWeights(this.animDirection);
    }

    /**
     * @param direction -1 (повністю вліво) … 0 (прямо) … 1 (повністю вправо)
     */
    private applyClipWeights(direction: number) {
        if (!this.animationPlayer) {
            return;
        }

        // Біг завжди на повну — це база пози. Strafe домішується поверх
        // рівно настільки, наскільки персонаж зараз зміщується вбік.
        this.setClipWeight(PlayerController.CLIP_RUN, 1);
        this.setClipWeight(PlayerController.CLIP_LEFT, Math.max(0, -direction));
        this.setClipWeight(PlayerController.CLIP_RIGHT, Math.max(0, direction));
    }

    private setClipWeight(name: string, weight: number) {
        const clip = this.animationPlayer.getClip(name);
        if (clip) {
            clip.weight = weight;
        }
    }
}
