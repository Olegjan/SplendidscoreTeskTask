/**
 * UIManager.ts
 * ---------------------------------------------------------------
 * Показує стан гри і більше нічого не робить: не рахує бали, не
 * знає правил, не приймає рішень. Отримує готові числа й перемикає
 * панелі.
 *
 * Завдяки цьому UI можна цілком перемалювати, не торкаючись
 * GameManager — міняється лише цей файл і обʼєкти в сцені.
 * ---------------------------------------------------------------
 */
@component
export class UIManager extends BaseScriptComponent {
    @input
    @hint('Стартовий екран.')
    menuPanel: SceneObject;

    @input
    @hint('Ігровий HUD: рахунок і життя.')
    hudPanel: SceneObject;

    @input
    @hint('Екран завершення гри.')
    gameOverPanel: SceneObject;

    @input
    scoreText: Text;

    @input
    livesText: Text;

    @input
    finalScoreText: Text;

    @input
    @allowUndefined
    @hint('Рекорд за сесію. Необовʼязковий.')
    bestScoreText: Text;

    showMenu() {
        this.setPanels(true, false, false);
    }

    showHud() {
        this.setPanels(false, true, false);
    }

    showGameOver(score: number, best: number) {
        this.setPanels(false, false, true);
        this.finalScoreText.text = 'SCORE  ' + score;
        if (this.bestScoreText) {
            this.bestScoreText.text = 'BEST  ' + best;
        }
    }

    updateScore(score: number) {
        this.scoreText.text = String(score);
    }

    updateLives(lives: number, maxLives: number) {
        // Порожні сердечка лишаються на місці — так видно не лише скільки
        // життів є, а й скільки вже втрачено.
        const safeLives = Math.max(0, lives);
        this.livesText.text = '♥'.repeat(safeLives) + '♡'.repeat(Math.max(0, maxLives - safeLives));
    }

    private setPanels(menu: boolean, hud: boolean, gameOver: boolean) {
        this.menuPanel.enabled = menu;
        this.hudPanel.enabled = hud;
        this.gameOverPanel.enabled = gameOver;
    }
}
