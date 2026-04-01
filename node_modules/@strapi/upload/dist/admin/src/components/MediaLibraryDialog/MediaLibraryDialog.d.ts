import type { File } from '../../../../shared/contracts/files';
import type { AllowedTypes } from '../AssetCard/AssetCard';
export interface MediaLibraryDialogProps {
    allowedTypes?: AllowedTypes[];
    multiple?: boolean;
    onClose: () => void;
    onSelectAssets: (selectedAssets: File[]) => void;
}
export declare const MediaLibraryDialog: ({ onClose, onSelectAssets, allowedTypes, multiple, }: MediaLibraryDialogProps) => import("react/jsx-runtime").JSX.Element;
