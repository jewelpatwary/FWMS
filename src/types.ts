export type UserRole = 'super_admin' | 'admin' | 'hr' | 'viewer';

export interface UserPermissions {
  canManageWorkers: boolean;
  canManageClients: boolean;
  canManagePermitHolders: boolean;
  canManageESP: boolean;
  canManageCOM: boolean;
  canViewReports: boolean;
  canApprovePayments: boolean;
}

export interface SignatureSettings {
  useSignature: boolean;
  text: string;
  fontFamily: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface LetterTemplate {
  id: string;
  name: string;
  content: string;
  letterheadUrl?: string;
  chopUrl?: string;
  chopPosition?: Position;
  signatureUrl?: string;
  signaturePosition?: Position;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  password?: string;
  displayName: string;
  role: UserRole;
  permissions?: UserPermissions;
  signature?: SignatureSettings;
  createdAt: string;
}

export interface Worker {
  id: string;
  workerId: string;
  fullName: string;
  oldPassport: string;
  newPassport: string;
  passportExpiry: string;
  permitExpiry: string;
  permitYear: string;
  permitHolder: string;
  managedBy: string;
  dob: string;
  gender: string;
  nationality: string;
  socsoNo: string;
  epfNo: string;
  remark: string;
  clientId: string;
  currentClientJoinDate?: string;
  currentClientTerminationDate?: string;
  workLocation: string;
  joinDate: string;
  resignDate?: string;
  status: 'Active' | 'Inactive' | 'Holiday';
  acknowledgement?: 'Agree' | 'Request COM' | 'OverStay' | '';
  fomemaStatus?: 'Payment Request' | 'Payment Done' | 'Payment Re-Request' | 'Purchased' | 'Clinic Booked' | 'Pending examination' | 'Review' | 'Pending for certification' | 'Suitable' | 'Unsuitable' | 'Refund' | 'Other' | '';
  fomemaReRequestReason?: string;
  insurancePurchase?: 'Purchased' | 'Payment Request' | 'Payment Done' | 'Payment Re-Request' | 'Blank' | 'Done' | 'Refund' | '';
  plksStatus?: 'Applied' | 'Application Approved' | 'Payment Request' | 'Pending payment' | 'Payment Done' | 'Payment Re-Request' | 'Collected' | 'Refund' | 'Payment Approved' | '';
  comRequestDate?: string;
  comApply?: string;
  comStatus?: 'Done' | '';
  espExpiry?: string;
  fomemaPaymentApproved?: boolean;
  fomemaPaymentApprovedBy?: string;
  fomemaPaymentApprovedAt?: string;
  insurancePaymentApproved?: boolean;
  insurancePaymentApprovedBy?: string;
  insurancePaymentApprovedAt?: string;
  plksPaymentApproved?: boolean;
  plksPaymentApprovedBy?: string;
  plksPaymentApprovedAt?: string;
  fomemaPaymentRequestedBy?: string;
  fomemaPaymentRequestedAt?: string;
  insurancePaymentRequestedBy?: string;
  insurancePaymentRequestedAt?: string;
  plksPaymentRequestedBy?: string;
  plksPaymentRequestedAt?: string;
  fomemaRefundApproved?: boolean;
  fomemaRefundApprovedBy?: string;
  fomemaRefundApprovedAt?: string;
  insuranceRefundApproved?: boolean;
  insuranceRefundApprovedBy?: string;
  insuranceRefundApprovedAt?: string;
  plksRefundApproved?: boolean;
  plksRefundApprovedBy?: string;
  plksRefundApprovedAt?: string;
  fomemaRefundRequestedBy?: string;
  fomemaRefundRequestedAt?: string;
  insuranceRefundRequestedBy?: string;
  insuranceRefundRequestedAt?: string;
  plksRefundRequestedBy?: string;
  plksRefundRequestedAt?: string;
  fomemaRefundReason?: string;
  insuranceRefundReason?: string;
  plksRefundReason?: string;
  fomemaPayment?: 'Payment Request' | 'Payment Done' | 'Payment Re-Request' | 'Refund' | '';
  insurancePayment?: 'Payment Request' | 'Payment Done' | 'Payment Re-Request' | 'Refund' | '';
  plksPayment?: 'Payment Request' | 'Payment Done' | 'Payment Re-Request' | 'Refund' | 'Payment Approved' | '';
  createdAt: string;
  updatedAt: string;
}

export interface ESPHistory {
  id: string;
  workerId: string;
  workerName: string;
  expiryDate: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  regNum: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  picName: string;
  picPhone?: string;
  picEmail?: string;
}

export interface PermitHolder {
  id: string;
  name: string;
  regNum?: string;
  address?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Permit {
  id: string;
  workerId: string;
  permitType: string;
  permitNumber: string;
  issueDate: string;
  expiryDate: string;
  levyPaid: number;
  status: string;
  documentUrl?: string;
}

export interface Passport {
  id: string;
  workerId: string;
  passportNumber: string;
  issueDate: string;
  expiryDate: string;
  documentUrl?: string;
}

export interface CustomField {
  id: string;
  name: string;
  dataType: 'text' | 'number' | 'date' | 'dropdown';
  options?: string[];
  defaultValue?: string;
  isVisible: boolean;
  isDefault?: boolean;
}

export interface WorkerCustomValue {
  id: string;
  workerId: string;
  fieldId: string;
  value: string;
}

export interface AuditLog {
  id: string;
  workerId: string;
  changedBy: string;
  changedByName: string;
  changeType: 'personal' | 'status' | 'custom_field';
  fieldName: string;
  oldValue: string;
  newValue: string;
  timestamp: string;
}

export interface PlacementHistory {
  id: string;
  workerId: string;
  workerName: string;
  clientId: string;
  clientName: string;
  joinDate: string;
  terminationDate?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}
