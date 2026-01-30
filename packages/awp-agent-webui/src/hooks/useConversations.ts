/**
 * useConversations Hook
 *
 * Manages conversation history and persistence
 */

import { useCallback, useEffect, useState } from "react";
import { type Conversation, conversationStorage, type Message } from "../storage";

export interface UseConversationsResult {
  /** All conversations */
  conversations: Conversation[];
  /** Currently active conversation */
  currentConversation: Conversation | null;
  /** Loading state */
  isLoading: boolean;
  /** Create a new conversation */
  createConversation: (title?: string) => Promise<Conversation>;
  /** Load a conversation by ID */
  loadConversation: (id: string) => Promise<Conversation | null>;
  /** Delete a conversation */
  deleteConversation: (id: string) => Promise<void>;
  /** Set current conversation */
  setCurrentConversation: (conversation: Conversation | null) => void;
  /** Add a message to current conversation */
  addMessage: (message: Omit<Message, "id" | "createdAt">) => Promise<Message>;
  /** Update active skills in current conversation */
  updateActiveSkills: (skillIds: string[]) => Promise<void>;
  /** Mark a skill as unloaded in current conversation */
  markSkillUnloaded: (skillId: string) => Promise<void>;
  /** Refresh conversations list */
  refresh: () => Promise<void>;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await conversationStorage.list();
      setConversations(loaded);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const createConversation = useCallback(async (title?: string): Promise<Conversation> => {
    const conversation = await conversationStorage.createNew(title);
    setConversations((prev) => [conversation, ...prev]);
    setCurrentConversation(conversation);
    return conversation;
  }, []);

  const loadConversation = useCallback(async (id: string): Promise<Conversation | null> => {
    const conversation = await conversationStorage.load(id);
    if (conversation) {
      setCurrentConversation(conversation);
    }
    return conversation;
  }, []);

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      await conversationStorage.delete(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
      }
    },
    [currentConversation]
  );

  const addMessage = useCallback(
    async (message: Omit<Message, "id" | "createdAt">): Promise<Message> => {
      if (!currentConversation) {
        throw new Error("No current conversation");
      }

      const newMessage = await conversationStorage.addMessage(currentConversation.id, message);

      // Update local state
      setCurrentConversation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, newMessage],
          updatedAt: Date.now(),
        };
      });

      // Update conversations list
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversation.id
            ? { ...c, messages: [...c.messages, newMessage], updatedAt: Date.now() }
            : c
        )
      );

      return newMessage;
    },
    [currentConversation]
  );

  const updateActiveSkills = useCallback(
    async (skillIds: string[]): Promise<void> => {
      if (!currentConversation) return;

      await conversationStorage.updateActiveSkills(currentConversation.id, skillIds);

      setCurrentConversation((prev) => {
        if (!prev) return null;
        return { ...prev, activeSkillIds: skillIds };
      });
    },
    [currentConversation]
  );

  const markSkillUnloaded = useCallback(
    async (skillId: string): Promise<void> => {
      if (!currentConversation) return;

      await conversationStorage.markSkillUnloaded(currentConversation.id, skillId);

      // Update local state
      setCurrentConversation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.loadedSkillId === skillId ? { ...msg, skillUnloaded: true } : msg
          ),
        };
      });
    },
    [currentConversation]
  );

  return {
    conversations,
    currentConversation,
    isLoading,
    createConversation,
    loadConversation,
    deleteConversation,
    setCurrentConversation,
    addMessage,
    updateActiveSkills,
    markSkillUnloaded,
    refresh: loadConversations,
  };
}
