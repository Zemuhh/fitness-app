import { MemberPackage } from '@/types/fitness';

export type PaymentMethodType = 'credit_card' | 'apple_pay' | 'bank_transfer';

export type InstallmentCount = 1 | 3 | 6;

export interface PackageCatalogPlan {
  id: number;
  code: string;
  name: string;
  subtitle: string;
  credits: number;
  duration_days: number;
  price_try: number;
  per_lesson_price_try: number;
  savings_percent: number;
  savings_amount_try: number;
  popular_badge?: string | null;
  features: string[];
  is_active: boolean;
}

export interface PaymentCheckoutRequestPayload {
  member_id: number;
  plan_id: number;
  payment_method: PaymentMethodType;
  card_holder_name?: string;
  card_number?: string;
  expiry_mm_yy?: string;
  cvv?: string;
  installment_count: InstallmentCount;
}

export interface DigitalReceipt {
  transaction_id: number;
  transaction_code: string;
  member_id: number;
  member_name: string;
  plan_id: number;
  plan_code: string;
  plan_name: string;
  member_package_id: number;
  amount_try: number;
  monthly_installment_try: number;
  payment_method: PaymentMethodType | string;
  payment_method_label: string;
  card_holder_name?: string | null;
  card_last4?: string | null;
  masked_payment_info: string;
  installment_count: number;
  purchased_credits: number;
  carried_credits: number;
  new_total_credits: number;
  expiry_date: string;
  status: 'completed' | 'failed' | string;
  created_at: string;
}

export interface PaymentCheckoutResponse {
  message: string;
  purchased_credits: number;
  carried_credits: number;
  new_total_credits: number;
  active_package: MemberPackage;
  receipt: DigitalReceipt;
}

export interface PaymentHistoryItem {
  id: number;
  transaction_code: string;
  member_id: number;
  plan_id: number;
  plan_name: string;
  plan_credits: number;
  member_package_id: number;
  package_total_credits: number;
  package_remaining_credits: number;
  package_expiry_date: string;
  package_is_active: boolean;
  amount_try: number;
  monthly_installment_try: number;
  payment_method: PaymentMethodType | string;
  payment_method_label: string;
  card_holder_name?: string | null;
  card_last4?: string | null;
  masked_payment_info: string;
  installment_count: number;
  status: 'completed' | 'failed' | string;
  created_at: string;
}

export interface MemberPaymentHistoryResponse {
  member_id: number;
  total_spent_try: number;
  transaction_count: number;
  active_package: MemberPackage | null;
  transactions: PaymentHistoryItem[];
  packages: MemberPackage[];
}
