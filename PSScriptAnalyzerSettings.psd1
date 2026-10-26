@{
    IncludeRules = @(
        'PSUseConsistentIndentation'
        'PSUseConsistentWhitespace'
        'PSUseConsistentBraceStyle'
        'PSAvoidUsingCmdletAliases'
        'PSAvoidUsingEmptyCatchBlock'
    )
    Rules = @{
        PSUseConsistentIndentation = @{
            Enable = $true
            Kind = 'space'
            IndentationSize = 4
        }
        PSUseConsistentWhitespace = @{
            Enable = $true
            CheckInnerBrace = $true
            CheckOpenBrace = $true
            CheckOpenParen = $true
            CheckOperator = $true
            CheckSeparator = $true
        }
        PSUseConsistentBraceStyle = @{
            Enable = $true
            OpenBraceOnSameLine = $true
            NewLineAfterOpenBrace = $true
            CloseBraceOnSameLine = $true
            NewLineAfterCloseBrace = $true
        }
    }
}
