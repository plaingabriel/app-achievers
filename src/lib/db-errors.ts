type MysqlLikeError = {
  code?: string;
  errno?: number;
  message?: string;
  sqlMessage?: string;
};

export function isMissingTableError(err: unknown, tableName: string): boolean {
  if (!err || typeof err !== 'object') return false;

  const mysqlErr = err as MysqlLikeError;
  const message = `${mysqlErr.message ?? ''} ${mysqlErr.sqlMessage ?? ''}`.toLowerCase();
  const table = tableName.toLowerCase();

  return (
    (mysqlErr.code === 'ER_NO_SUCH_TABLE' ||
      mysqlErr.errno === 1146 ||
      message.includes("doesn't exist") ||
      message.includes('no such table')) &&
    message.includes(table)
  );
}
