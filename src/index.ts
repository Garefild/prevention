/**
 * Exports Types
 */

export type { ValidationResultInterface, MinifyCheckResultInterface } from '@interfaces/validator.interface';
export type { ValidationKindType, ValidationFindingInterface } from '@interfaces/validator.interface';
export type { SeverityType, CheckSeverityType, BlacklistEntryInterface } from '@interfaces/config.interface';
export type { ChecksConfigInterface, ConfigInterface, PartialConfigInterface } from '@interfaces/config.interface';

/**
 * Exports
 */

export { checkMinified } from '@services/minify.service';
export { validateSource } from '@services/validator.service';
export { normalizeGlob, isIgnored } from '@services/ignore.service';
export { walkFiles, validateFolder } from '@services/walker.service';
export { compileBlacklist, scanBlacklist } from '@services/blacklist.service';
export { DEFAULT_CONFIG, DEFAULT_CONFIG_FILENAME, shouldShow } from '@services/config.service';
export { readConfigFile, resolveConfigPath, mergeConfig, loadConfig } from '@services/config.service';
export { VERSION, renderBanner, colorSeverity, colorKind, colorOk, colorFail } from '@services/banner.service';
