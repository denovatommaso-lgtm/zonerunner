"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCurrentStreakDays = computeCurrentStreakDays;
/**
 * Compute the current streak of consecutive days with at least one run.
 * The count resets to 0 if the user has no runs, or to 1 on the first run day.
 */
function computeCurrentStreakDays(runs) {
    const dates = runs
        .map((r) => new Date(r.startedAt).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b);
    let currentStreak = 0;
    let prevDay = null;
    for (const ts of dates) {
        const day = Math.floor(ts / (1000 * 60 * 60 * 24));
        if (prevDay === null || day === prevDay) {
            currentStreak = Math.max(1, currentStreak || 1);
        }
        else if (day === prevDay + 1) {
            currentStreak += 1;
        }
        else {
            currentStreak = 1;
        }
        prevDay = day;
    }
    return currentStreak;
}
