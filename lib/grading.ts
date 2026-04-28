export function getGradeMultiplier(company: string | null | undefined, grade: number | null | undefined): number {
  if (!company || company === 'RAW' || grade == null) return 1

  if (company === 'PSA') {
    if (grade === 10) return 4.0
    if (grade === 9) return 1.8
    if (grade === 8) return 1.2
    if (grade === 7) return 1.0
    if (grade >= 5) return 0.85
    return 0.7
  }

  if (company === 'BGS') {
    if (grade === 10) return 5.0
    if (grade >= 9.5) return 3.5
    if (grade >= 9) return 1.8
    if (grade >= 8.5) return 1.3
    if (grade >= 8) return 1.1
    return 0.9
  }

  if (company === 'CGC') {
    if (grade === 10) return 2.8
    if (grade >= 9.5) return 2.2
    if (grade >= 9) return 1.5
    if (grade >= 8) return 1.1
    return 0.9
  }

  if (company === 'TAG') {
    if (grade === 10) return 3.5
    if (grade >= 9) return 1.8
    if (grade >= 8) return 1.2
    return 1.0
  }

  return 1
}

export function getAdjustedUsdPrice(
  rawUsdPrice: number | null | undefined,
  company: string | null | undefined,
  grade: number | null | undefined,
): number | null {
  if (rawUsdPrice == null) return null
  return rawUsdPrice * getGradeMultiplier(company, grade)
}
