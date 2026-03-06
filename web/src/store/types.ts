/**
 * Shared types for the Zustand store and its slices.
 *
 * Each slice defines its own State + Actions interfaces.
 * AppState is the union of all slices — passed to create().
 */

import type { GraphSliceState, GraphSliceActions } from './slices/graphSlice';
import type { HelpSliceState, HelpSliceActions } from './slices/helpSlice';
import type { TreeSliceState, TreeSliceActions } from './slices/treeSlice';
import type { HistorySliceState, HistorySliceActions } from './slices/historySlice';
import type { SelectionSliceState, SelectionSliceActions } from './slices/selectionSlice';
import type { ShareSliceState, ShareSliceActions } from './slices/shareSlice';

export type AppState =
  & GraphSliceState & GraphSliceActions
  & HelpSliceState & HelpSliceActions
  & TreeSliceState & TreeSliceActions
  & HistorySliceState & HistorySliceActions
  & SelectionSliceState & SelectionSliceActions
  & ShareSliceState & ShareSliceActions;

/** Zustand set/get with full AppState typing */
export type SetState = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
) => void;
export type GetState = () => AppState;
