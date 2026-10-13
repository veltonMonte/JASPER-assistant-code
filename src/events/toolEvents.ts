import { EventEmitter } from 'events';

// Global Event Emitter to orchestrate communication between WebSockets and Tools
class ToolEventEmitter extends EventEmitter {}

export const toolEvents = new ToolEventEmitter();
