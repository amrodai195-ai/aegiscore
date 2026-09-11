CREATE TABLE `users` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `githubId` varchar(64) NOT NULL UNIQUE,
  `githubLogin` varchar(128) NOT NULL,
  `githubTokenEncrypted` text,
  `name` text,
  `email` varchar(320),
  `avatarUrl` varchar(1024),
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `repositories` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `ownerId` int NOT NULL,
  `workspaceSlug` varchar(128) NOT NULL,
  `name` varchar(255) NOT NULL,
  `branch` varchar(128) NOT NULL DEFAULT 'main',
  `githubOwner` varchar(128),
  `githubRepo` varchar(255),
  `githubDefaultBranch` varchar(128),
  `sourceType` enum('github','upload') NOT NULL DEFAULT 'upload',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `repositories_owner_workspace_unique` (`ownerId`,`workspaceSlug`)
);

CREATE TABLE `repositoryFiles` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `repositoryId` int NOT NULL,
  `path` varchar(1024) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `mimeType` varchar(128),
  `sizeBytes` int NOT NULL DEFAULT 0,
  `sha` varchar(128),
  `storageKey` varchar(1024),
  `language` varchar(64),
  `status` enum('ready','scanning','complete','error') NOT NULL DEFAULT 'ready',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `scans` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `repositoryId` int NOT NULL,
  `status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  `engineVersion` varchar(64) NOT NULL DEFAULT 'aegis-static-1',
  `filesScanned` int NOT NULL DEFAULT 0,
  `findingsCount` int NOT NULL DEFAULT 0,
  `criticalCount` int NOT NULL DEFAULT 0,
  `highCount` int NOT NULL DEFAULT 0,
  `mediumCount` int NOT NULL DEFAULT 0,
  `lowCount` int NOT NULL DEFAULT 0,
  `errorMessage` text,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `findings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `scanId` int NOT NULL,
  `code` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `severity` enum('critical','high','medium','low','info') NOT NULL,
  `confidence` int NOT NULL DEFAULT 80,
  `filename` varchar(1024) NOT NULL,
  `lineNumber` int NOT NULL DEFAULT 0,
  `lineEnd` int NOT NULL DEFAULT 0,
  `description` text NOT NULL,
  `remediation` text,
  `evidence` text,
  `fingerprint` varchar(128) NOT NULL,
  `scanner` varchar(64) NOT NULL DEFAULT 'aegis-static',
  `status` enum('open','resolved','ignored') NOT NULL DEFAULT 'open',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `chatMessages` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `repositoryId` int,
  `userId` int,
  `role` enum('user','assistant','system') NOT NULL,
  `content` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `patches` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `repositoryId` int NOT NULL,
  `findingId` int NOT NULL,
  `path` varchar(1024) NOT NULL,
  `title` varchar(255) NOT NULL,
  `explanation` text NOT NULL,
  `originalContent` text NOT NULL,
  `proposedContent` text NOT NULL,
  `diff` text NOT NULL,
  `status` enum('proposed','approved','rejected','applied') NOT NULL DEFAULT 'proposed',
  `githubCommitSha` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approvedAt` timestamp NULL
);

CREATE TABLE `auditLogs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int,
  `repositoryId` int,
  `action` varchar(128) NOT NULL,
  `target` varchar(1024),
  `metadata` text,
  `success` boolean NOT NULL DEFAULT TRUE,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
