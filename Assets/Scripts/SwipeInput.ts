/**
 * SwipeInput.ts
 * ---------------------------------------------------------------
 * Тонкий шар вводу: перетворює сирі тач-події на чотири напрямки
 * свайпу + короткий тап. Більше він не робить нічого — не знає ані
 * про гравця, ані про стан гри.
 *
 * Навіщо окремо: ігрова логіка не повинна знати, звідки прийшла
 * команда "вліво". Завтра замість свайпу можна підключити кнопки
 * або жести рук — зміниться лише цей файл.
 *
 * Це НЕ компонент, а звичайний клас: він позичає createEvent() у
 * компонента-власника. Так у сцені не заводиться зайвий SceneObject
 * лише заради читання тачів.
 *
 * Координати тачу нормалізовані: [0,0] — лівий верхній кут екрана,
 * [1,1] — правий нижній. Тому свайп вгору це відʼємний dy.
 * ---------------------------------------------------------------
 */

export enum Swipe {
    Left = 'Left',
    Right = 'Right',
    Up = 'Up',
    Down = 'Down',
}

export class SwipeInput {
    /** Мінімальна довжина жесту в частках екрана, щоб він рахувався свайпом. */
    private readonly minDistance: number;

    private startPos: vec2 | null = null;

    private swipeHandler: ((direction: Swipe) => void) | null = null;
    private tapHandler: (() => void) | null = null;

    constructor(owner: BaseScriptComponent, minDistance: number = 0.06) {
        this.minDistance = minDistance;

        // Забираємо тачі собі, інакше свайпи перегортатимуть лінзи в Snapchat.
        // Виняток для подвійного тапу лишаємо системі — це перемикання камери,
        // і відбирати його у користувача було б грубо.
        global.touchSystem.touchBlocking = true;
        global.touchSystem.enableTouchBlockingException('TouchTypeDoubleTap', true);

        owner.createEvent('TouchStartEvent').bind((event: TouchStartEvent) => {
            this.startPos = event.getTouchPosition();
        });

        owner.createEvent('TouchEndEvent').bind((event: TouchEndEvent) => {
            if (!this.startPos) {
                return;
            }
            const endPos = event.getTouchPosition();
            this.resolveGesture(endPos.x - this.startPos.x, endPos.y - this.startPos.y);
            this.startPos = null;
        });
    }

    /** Підписка на свайпи. Один слухач — більше цій грі не треба. */
    onSwipe(handler: (direction: Swipe) => void) {
        this.swipeHandler = handler;
    }

    /** Підписка на короткий тап (використовується для старту/рестарту). */
    onTap(handler: () => void) {
        this.tapHandler = handler;
    }

    private resolveGesture(dx: number, dy: number) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Жест закороткий — це тап, а не свайп.
        if (absX < this.minDistance && absY < this.minDistance) {
            if (this.tapHandler) {
                this.tapHandler();
            }
            return;
        }

        if (!this.swipeHandler) {
            return;
        }

        // Домінуюча вісь виграє: діагональні жести не мають бути двозначними.
        if (absX > absY) {
            this.swipeHandler(dx > 0 ? Swipe.Right : Swipe.Left);
        } else {
            this.swipeHandler(dy < 0 ? Swipe.Up : Swipe.Down);
        }
    }
}
