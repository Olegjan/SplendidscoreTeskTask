/**
 * AudioManager.ts
 * ---------------------------------------------------------------
 * Звукові ефекти подій гри. Як і UIManager, нічого не вирішує —
 * лише отримує команду «зіграй це» і грає.
 *
 * Один метод play(Sfx) замість методу на кожен звук. Словник
 * збирається сам: менеджер обходить власних нащадків і бере ключ з
 * їхніх імен — "SFX_Coin" → Sfx.Coin. Входів у компонента немає
 * взагалі, тож додати звук — це покласти обʼєкт під "Audio" і
 * дописати рядок в enum.
 *
 * Плата за це — звʼязок з іменами в сцені. Щоб перейменування не
 * ламало звук мовчки, onAwake звіряє сцену з enum і друкує, чого
 * бракує і що зайве.
 * ---------------------------------------------------------------
 */

/** Подія гри, яку можна озвучити. Значення = суфікс імені обʼєкта після "SFX_". */
export enum Sfx {
    Coin = 'Coin',
    Hit = 'Hit',
    Jump = 'Jump',
    Slide = 'Slide',
    Lane = 'Lane',
}

/** Префікс, за яким з імені обʼєкта дістається ключ. */
const NAME_PREFIX = 'SFX_';

@component
export class AudioManager extends BaseScriptComponent {
    private readonly byEvent: { [key: string]: AudioComponent } = {};

    onAwake() {
        this.collectSounds();
        this.reportGaps();
    }

    /**
     * Програє звук події. Якщо звуку немає — тиша, без помилки:
     * гра не має падати через неозвучену подію.
     *
     * Доріжка спершу зупиняється, а потім запускається заново. Монетки
     * йдуть щільно, і якщо просто викликати play(), поки звучить
     * попередній звук, Lens Studio ігнорує виклик — половина підборів
     * лишається без фідбеку.
     */
    play(event: Sfx) {
        const audio = this.byEvent[event];
        if (!audio) {
            return;
        }
        if (audio.isPlaying()) {
            audio.stop(false);
        }
        audio.play(1);
    }

    // ---------------------------------------------------------------

    /** Обходить власних нащадків і складає словник «подія → звук». */
    private collectSounds() {
        const root = this.getSceneObject();
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const object = root.getChild(i);
            const audio = object.getComponent('Component.AudioComponent') as AudioComponent;
            if (!audio) {
                print('AudioManager: на обʼєкті "' + object.name + '" немає AudioComponent');
                continue;
            }

            this.byEvent[this.toEventKey(object.name)] = audio;
        }
    }

    private toEventKey(objectName: string): string {
        return objectName.indexOf(NAME_PREFIX) === 0
            ? objectName.substring(NAME_PREFIX.length)
            : objectName;
    }

    /** Голосно повідомляє про розбіжності між enum і сценою. */
    private reportGaps() {
        const known: string[] = [Sfx.Coin, Sfx.Hit, Sfx.Jump, Sfx.Slide, Sfx.Lane];

        const missing = known.filter((event) => !this.byEvent[event]);
        if (missing.length > 0) {
            print('AudioManager: немає звуку для подій — ' + missing.join(', '));
        }

        const unknown = Object.keys(this.byEvent).filter((key) => known.indexOf(key) < 0);
        if (unknown.length > 0) {
            print('AudioManager: звуки без відповідної події в enum — ' + unknown.join(', '));
        }
    }
}
