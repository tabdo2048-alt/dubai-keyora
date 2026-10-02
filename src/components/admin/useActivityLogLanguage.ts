import { createContext, useContext } from "react";

export type ActivityLogLanguage = "en" | "ar";
export const ActivityLogLanguageContext = createContext<{
  language: ActivityLogLanguage;
  toggle: () => void;
  t: (text: string) => string;
}>({ language: "en", toggle: () => {}, t: (text) => text });

export const useActivityLogLanguage = () => useContext(ActivityLogLanguageContext);
