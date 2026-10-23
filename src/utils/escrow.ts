// DEPRECATED - Use chainConnectV2.ts instead
// This file is kept for backward compatibility only

// Re-export from new contract
export { 
  CHAIN_CONNECT_V2_ABI as ESCROW_ABI,
  CHAIN_CONNECT_V2_ADDRESS as ESCROW_CONTRACT_ADDRESS,
  getJobStatusFromNumber,
  getLevelName
} from './chainConnectV2';

// Keep old exports for compatibility
export const ORGANIZER_FEE_RATE = 100; // 1%
export const VENDOR_FEE_RATE = 100; // 1%
export const ADVANCE_PAYMENT_RATE = 1500; // 15%

export enum JobStatus {
  Created = 0,
  Funded = 1,
  InProgress = 2,
  Completed = 3,
  Released = 4,
  Refunded = 5
}
