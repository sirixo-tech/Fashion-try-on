-- Keep destructive verification separate from sign-in and password recovery.
ALTER TYPE "CustomerActionPurpose" ADD VALUE 'DELETE_ACCOUNT';
