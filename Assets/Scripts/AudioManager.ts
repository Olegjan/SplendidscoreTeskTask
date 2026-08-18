/**
 * AudioManager.ts
 * ---------------------------------------------------------------
 * Звукові ефекти подій гри. Як і UIManager, нічого не вирішує —
 * лише отримує команду «зіграй це» і грає.
 *
 * Окремий файл, а не два поля в GameManager: коли додасться звук
 * стрибка, підкату чи фонова музика, вони приїдуть сюди, а не
 * розмиють стан-машину.
 * ---------------------------------------------------------------
 */
@component
export class AudioManager extends BaseScriptComponent {
    @input
    @allowUndefined
    @hint('Короткий звук підбору монетки.')
    coinSound: AudioComponent;

    @input
    @allowUndefined
    @hint('Глухий звук зіткнення з перешкодою.')
    hitSound: AudioComponent;

    playCoin() {
        this.playOneShot(this.coinSound);
    }

    playHit() {
        this.playOneShot(this.hitSound);
    }

    /**
     * Монетки можуть іти щільно, одна за одною. Якщо просто викликати
     * play(), Lens Studio ігнорує виклик, поки триває попередній звук —
     * і половина підборів лишається без фідбеку. Тому перезапускаємо
     * доріжку з початку: різкіше, але чути кожну монетку.
     */
    private playOneShot(audio: AudioComponent) {
        if (!audio) {
            return; // звук не підвʼязали — гра має працювати й без нього
        }
        if (audio.isPlaying()) {
            audio.stop(false);
        }
        audio.play(1);
    }
}
