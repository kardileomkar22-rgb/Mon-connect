declare module 'react-icons/fa' {
  import { FC, SVGAttributes } from 'react';
  
  export interface IconBaseProps extends SVGAttributes<SVGElement> {
    children?: React.ReactNode;
    size?: string | number;
    color?: string;
    title?: string;
  }
  
  export type IconType = FC<IconBaseProps>;
  
  export const FaCheckCircle: IconType;
  export const FaMoneyBillWave: IconType;
  export const FaClock: IconType;
  export const FaInfoCircle: IconType;
  export const FaTimes: IconType;
  export const FaSync: IconType;
  export const FaHourglassHalf: IconType;
  export const FaChartBar: IconType;
  export const FaRocket: IconType;
  export const FaClipboardCheck: IconType;
  export const FaTimesCircle: IconType;
  export const FaFileAlt: IconType;
  export const FaSave: IconType;
  export const FaUsers: IconType;
  export const FaPalette: IconType;
  export const FaWallet: IconType;
  export const FaSignOutAlt: IconType;
}

