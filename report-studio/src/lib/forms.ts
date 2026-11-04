// Shapes returned by the studio's form actions. Kept apart from the server
// actions so client components can use them without importing server code.
import type { FieldErrors } from "./validation";
import type { FormErrors } from "./report/parse";

export interface FormState {
  error?: string;
  fields?: FieldErrors;
}

export interface ReportFormState {
  errors?: FormErrors;
  error?: string;
}

export interface BrandFormState {
  error?: string;
  saved?: boolean;
}

/** A form action, as passed to useActionState: a server action in the app. */
export type FormAction<S> = (state: S, fd: FormData) => Promise<S>;
