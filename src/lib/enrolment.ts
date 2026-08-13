/**
 * How many reference faces a person needs.
 *
 * Three is the point of diminishing returns: front, and two angles. One works
 * but degrades as the season changes someone's hair and the light; past about
 * twenty, extra faces add noise rather than accuracy.
 *
 * These live outside the server-actions module because a `"use server"` file
 * may only export async functions.
 */
export const TARGET_PORTRAITS = 3;
export const MAX_PORTRAITS = 20;
