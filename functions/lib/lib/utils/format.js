"use strict";
// Shared formatting helpers across the app.
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTimeHrs = formatTimeHrs;
exports.formatDate = formatDate;
exports.formatDistance = formatDistance;
function formatTimeHrs(seconds) {
    if (!seconds || seconds <= 0)
        return '0h 00m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const h = hours.toString();
    const m = minutes.toString().padStart(2, '0');
    return `${h}h ${m}m`;
}
function formatDate(dateStr) {
    if (!dateStr)
        return 'Unknown date';
    let d = new Date(dateStr);
    // If the string is like "2025-12-03 10:22:00", fix it to "2025-12-03T10:22:00"
    if (Number.isNaN(d.getTime())) {
        const fixed = dateStr.replace(' ', 'T');
        d = new Date(fixed);
    }
    if (Number.isNaN(d.getTime())) {
        return 'Unknown date';
    }
    return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}
function formatDistance(meters) {
    if (!Number.isFinite(meters))
        return '0 m';
    if (meters < 1000) {
        const rounded = Math.round(meters);
        return `${rounded} m`;
    }
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
}
