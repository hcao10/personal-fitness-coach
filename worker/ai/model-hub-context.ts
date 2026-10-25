/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { HUB_TOOL_NAMES, hubCoachTask } from '../../packages/integrations/src/model-hub/coach-task.ts';
import { ModelHubError } from './model-hub-client.ts';

const bounded = (value: unknown, limit: number) => String(value ?? '').slice(0, limit);
function compactTool(name: string, data: any, locale: string): unknown {
  if (data?.error) return { error: data.error };
  if (name === 'get_training_context') return {
    profile: data.context?.profile, mode: data.context?.coachingMode,
    // A dated session replaces the entire repeating plan and duplicated catalog metadata.
    today: data.today ? { date: data.today.date, occurrenceId: data.today.occurrenceId, revision: data.today.revision,
      duration: data.today.workout.duration, restDay: data.today.workout.restDay,
      exercises: data.today.exercises.map((x: any) => ({ id: x.id, exerciseInstanceId: x.exerciseInstanceId,
        name: x.name?.[locale], sets: x.sets, reps: x.reps, restSeconds: x.restSeconds, loadMultiplier: x.suggestedLoadMultiplier })) } : null,
    evidence: data.evidence, missing: data.missing,
    recentMeasurements: data.context?.recentMeasurements?.slice(0, 3),
    summary: bounded(data.context?.conversationSummary, 300), omitted: 'Weekly template, catalog assets and unrelated records omitted; use history/knowledge tools when needed.',
  };
  if (name === 'preview_session_change') return { proposalId: data.proposalId, occurrenceId: data.occurrenceId,
    baseRevision: data.baseRevision, scheduledDate: data.scheduledDate, change: data.change,
    before: data.before, after: data.after, reason: data.reason, impact: data.impact, requiresConfirmation: true };
  if (name === 'find_substitutions') return { limitations: data.limitations,
    candidates: data.candidates?.slice(0, 10).map((x: any) => ({ id: x.id, name: x.name?.[locale], target: x.target?.[locale] })),
    truncated: (data.candidates?.length || 0) > 10 };
  if (name === 'get_exercise_history') return { records: data.records?.slice(0, 8), evidence: data.evidence?.slice(0, 8),
    missing: data.missing, truncated: (data.records?.length || 0) > 8 };
  if (name === 'retrieve_knowledge') return Array.isArray(data) ? data.slice(0, 3).map(x => ({
    id: x.id, title: x.title, summary: bounded(x.summary ?? x.snippet ?? x.text ?? x.content, 500), publisher: x.publisher, url: x.url,
  })) : data;
  throw new ModelHubError('MODEL_HUB_UNKNOWN_TOOL');
}

export function hubCoachInput(prompt: LanguageModelV4Prompt, locale: string, highRisk: boolean) {
  const userMessages = prompt.filter(m => m.role === 'user');
  const current = userMessages.at(-1);
  const text = current?.content.filter(p => p.type === 'text').map(p => p.text).join('') || '';
  let selected: any;
  try { selected = JSON.parse(text); } catch { throw new ModelHubError('MODEL_HUB_INVALID_USER_INPUT'); }
  const observations: Array<{ tool: string; data: string }> = [];
  for (const message of prompt) {
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type !== 'tool-result') continue;
      if (!HUB_TOOL_NAMES.includes(part.toolName as typeof HUB_TOOL_NAMES[number])) throw new ModelHubError('MODEL_HUB_UNKNOWN_TOOL');
      const value = 'value' in part.output ? part.output.value : { error: 'TOOL_EXECUTION_DENIED' };
      const data = JSON.stringify(compactTool(part.toolName, value, locale));
      if (data.length > 6000) throw new ModelHubError('MODEL_HUB_TOOL_INPUT_TOO_LARGE');
      observations.push({ tool: part.toolName, data });
    }
  }
  const history = prompt.filter(m => m !== current && m.role !== 'tool' && m.role !== 'system')
    .slice(-4).map(m => ({ role: m.role, text: bounded(Array.isArray(m.content) ? m.content.filter(p => p.type === 'text').map(p => p.text).join('') : '', 220) }));
  const input = { locale, highRisk, message: selected.message, scene: JSON.stringify(selected.scene || {}),
    history: JSON.stringify({ recent: history, truncated: true }), evidence: JSON.stringify(selected.evidence || []), observations };
  // Never silently clip a current instruction, evidence ID or authoritative preview to fit.
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > hubCoachTask.maxInputBytes) throw new ModelHubError('MODEL_HUB_INPUT_TOO_LARGE');
  if (input.scene.length > 700 || input.history.length > 1200 || input.evidence.length > 1600 || observations.length > 6) throw new ModelHubError('MODEL_HUB_INPUT_TOO_LARGE');
  return input;
}
