export interface RecordTemplate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly subcategory: string;
  readonly method?: string;
  readonly contentTemplate: string;
}
