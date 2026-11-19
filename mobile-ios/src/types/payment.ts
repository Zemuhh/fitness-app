import { MemberPackage } from '@/types/fitness';

export type PaymentMethodType = 'credit_card' | 'apple_pay' | 'bank_transfer';

export type InstallmentCount = 1 | 3 | 6;

export type CheckoutSessionStatus =
  | 'pending'
  | 'requires_3ds'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type PaymentGatewayProvider =
  | 'stripe'
  | 'iyzico'
  | 'erya_3ds_gateway'
  | string;

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

export interface CreateCheckoutSessionPayload {
  member_id: number;
  plan_id?: number;
  plan_code?: string;
  installment_count?: InstallmentCount;
  payment_method?: PaymentMethodType;
  return_url?: string;
  cancel_url?: string;
  prefer_hosted_gateway?: boolean;
}

export interface CheckoutSessionCreatedResponse {
  session_id: string;
  checkout_url: string;
  status: CheckoutSessionStatus;
  amount: number;
  currency: string;
  provider: PaymentGatewayProvider;
  expires_at: string;
  member_id: number;
  plan_id: number;
  plan_code: string;
  plan_name: string;
  plan_credits: number;
  installment_count: number;
  return_url?: string | null;
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
  booked_hold_count?: number;
  new_remaining_credits: number;
  new_total_credits: number;
  expiry_date: string;
  status: 'completed' | 'failed' | string;
  created_at: string;
}

export interface CheckoutSessionStatusResponse {
  session_id: string;
  status: CheckoutSessionStatus;
  provider: PaymentGatewayProvider;
  member_id: number;
  member_name: string;
  plan_id: number;
  plan_code: string;
  plan_name: string;
  plan_credits: number;
  amount: number;
  currency: string;
  installment_count: number;
  monthly_installment_try: number;
  payment_method: string;
  card_last4?: string | null;
  card_brand?: string | null;
  bank_name?: string | null;
  checkout_url: string;
  return_url?: string | null;
  created_at: string;
  expires_at: string;
  completed_at?: string | null;
  failure_reason?: string | null;
  transaction_code?: string | null;
  credited_package_id?: number | null;
  credited_package_name?: string | null;
  purchased_credits: number;
  carried_credits: number;
  booked_hold_count?: number;
  new_remaining_credits?: number | null;
  new_total_credits?: number | null;
  package_expiry_date?: string | null;
  active_package?: MemberPackage | null;
  receipt?: DigitalReceipt | null;
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

export interface PaymentCheckoutResponse {
  message: string;
  purchased_credits: number;
  carried_credits: number;
  booked_hold_count?: number;
  new_remaining_credits: number;
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
