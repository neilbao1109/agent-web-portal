/**
 * IndexedDB Storage for Conversation History
 */

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** For assistant messages with tool calls */
  toolCalls?: ToolCall[];
  /** For tool result messages */
  toolResult?: ToolResult;
  /** Track which skill loaded this (for placeholder replacement) */
  loadedSkillId?: string;
  /** Whether this skill has been unloaded (content becomes placeholder) */
  skillUnloaded?: boolean;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  /** Active skill IDs at conversation save time */
  activeSkillIds: string[];
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "awp-agent-conversations";
const STORE_NAME = "conversations";
const DB_VERSION = 1;

export class ConversationStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  async save(conversation: Conversation): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({
        ...conversation,
        updatedAt: Date.now(),
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async load(id: string): Promise<Conversation | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async list(): Promise<Conversation[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("updatedAt");
      const request = index.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Sort by updatedAt descending (most recent first)
        const results = request.result as Conversation[];
        results.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(results);
      };
    });
  }

  async createNew(title?: string): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
      id: `conv-${now}-${Math.random().toString(36).substring(2, 8)}`,
      title: title || `Conversation ${new Date(now).toLocaleString()}`,
      messages: [],
      activeSkillIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.save(conversation);
    return conversation;
  }

  async addMessage(
    conversationId: string,
    message: Omit<Message, "id" | "createdAt">
  ): Promise<Message> {
    const conversation = await this.load(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      createdAt: Date.now(),
    };

    conversation.messages.push(newMessage);
    await this.save(conversation);
    return newMessage;
  }

  async updateActiveSkills(conversationId: string, activeSkillIds: string[]): Promise<void> {
    const conversation = await this.load(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.activeSkillIds = activeSkillIds;
    await this.save(conversation);
  }

  async markSkillUnloaded(conversationId: string, skillId: string): Promise<void> {
    const conversation = await this.load(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Mark all messages from this skill as unloaded
    for (const msg of conversation.messages) {
      if (msg.loadedSkillId === skillId) {
        msg.skillUnloaded = true;
      }
    }

    await this.save(conversation);
  }
}

// Singleton instance
export const conversationStorage = new ConversationStorage();
