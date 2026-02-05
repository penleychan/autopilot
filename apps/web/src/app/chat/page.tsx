"use client";

import "../globals.css";
import { useEffect, useState, ComponentType } from "react";
import { DefaultChatTransport, ToolUIPart } from "ai";
import { useChat } from "@ai-sdk/react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";

import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { getToolUIComponent, hasGenerativeUI } from "@/lib/utils";

function Chat() {
  const [input, setInput] = useState<string>("");

  const { messages, setMessages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "http://localhost:4111/chat/weatherAgent",
      prepareSendMessagesRequest({ messages }) {
        return {
          body: {
            messages,
            memory: {
              thread: "example-user-id",
              resource: "weather-chat",
            },
          },
        };
      },
    }),
  });

  useEffect(() => {
    const fetchMessages = async () => {
      const res = await fetch("/api/chat");
      const data = await res.json();
      setMessages([...data]);
    };
    fetchMessages();
  }, [setMessages]);

  const handleSubmit = async () => {
    if (!input.trim()) return;

    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="w-full p-6 relative size-full h-screen">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message) => {
              const hasGenerativeUIResult = message.parts?.some(
                (part) =>
                  part.type &&
                  hasGenerativeUI(part.type) &&
                  (part as ToolUIPart).state === "output-available",
              );

              return (
                <div key={message.id}>
                  {message.parts?.map((part, i) => {
                    if (part.type === "text") {
                      if (
                        hasGenerativeUIResult &&
                        message.role === "assistant"
                      ) {
                        return null;
                      }
                      return (
                        <Message key={`${message.id}-${i}`} from={message.role}>
                          <MessageContent>
                            <MessageResponse>{part.text}</MessageResponse>
                          </MessageContent>
                        </Message>
                      );
                    }

                    if (part.type?.startsWith("tool-")) {
                      const ToolUIComponent = getToolUIComponent(part.type);

                      if (ToolUIComponent) {
                        const toolPart = part as ToolUIPart;
                        switch (toolPart.state) {
                          case "input-available":
                            return <div key={i}>Loading...</div>;
                          case "output-available":
                            return (
                              <div key={i}>
                                <ToolUIComponent
                                  {...(toolPart.output as object)}
                                />
                              </div>
                            );
                          case "output-error":
                            return (
                              <div key={i}>Error: {toolPart.errorText}</div>
                            );
                          default:
                            return null;
                        }
                      }

                      return (
                        <Tool key={`${message.id}-${i}`}>
                          <ToolHeader
                            type={(part as ToolUIPart).type}
                            state={
                              (part as ToolUIPart).state || "output-available"
                            }
                            className="cursor-pointer"
                          />
                          <ToolContent>
                            <ToolInput
                              input={(part as ToolUIPart).input || {}}
                            />
                            <ToolOutput
                              output={(part as ToolUIPart).output}
                              errorText={(part as ToolUIPart).errorText}
                            />
                          </ToolContent>
                        </Tool>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })}
            <ConversationScrollButton />
          </ConversationContent>
        </Conversation>

        <PromptInput onSubmit={handleSubmit} className="mt-20">
          <PromptInputBody>
            <PromptInputTextarea
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setInput(e.target.value)
              }
              className="md:leading-10"
              value={input}
              placeholder="Type your message..."
              disabled={status !== "ready"}
            />
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  );
}

export default Chat;
