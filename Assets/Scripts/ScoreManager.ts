import { CONFIG } from './GameConfig';

/**
 * ScoreManager.ts
 * ---------------------------------------------------------------
 * Чиста логіка рахунку, без жодних посилань на сцену.
 *
 * Тримається окремо від GameManager саме тому, що не має залежностей:
 * це єдина частина гри, яку можна перевірити звичайним unit-тестом,
 * не запускаючи Lens Studio.
 *
 * Рахунок росте з двох джерел: монетки (активна дія гравця) і час
 * виживання (пасивна винагорода за дистанцію). Друге потрібне, щоб
 * обережна гра без ризику теж мала сенс.
 * ---------------------------------------------------------------
 */
export class ScoreManager {
    private score: number = 0;
    private best: number = 0;
    /** Дробовий залишок секунд — щоб бали за час не губились між кадрами. */
    private timeCarry: number = 0;

    getScore(): number {
        return Math.floor(this.score);
    }

    getBest(): number {
        return Math.floor(this.best);
    }

    addCoin() {
        this.score += CONFIG.scorePerCoin;
        this.updateBest();
    }

    /** Нараховує бали за час. Викликається щокадру під час гри. */
    addTime(deltaTime: number) {
        this.timeCarry += deltaTime;
        this.score += deltaTime * CONFIG.scorePerSecond;
        this.updateBest();
    }

    /** Обнуляє поточну спробу. Рекорд сесії при цьому зберігається. */
    reset() {
        this.score = 0;
        this.timeCarry = 0;
    }

    private updateBest() {
        if (this.score > this.best) {
            this.best = this.score;
        }
    }
}
